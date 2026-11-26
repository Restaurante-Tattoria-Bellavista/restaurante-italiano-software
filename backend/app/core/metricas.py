"""Métricas de la API para Prometheus (HU-20 y HU-21).

Cada réplica del backend expone sus propias métricas en GET /metrics y Prometheus
las lee una por una. El backend corre un solo proceso de uvicorn por contenedor,
así que no hace falta el modo multiproceso de prometheus_client.
"""
import logging
import time

from fastapi import APIRouter, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, REGISTRY, Counter, Gauge, Histogram, generate_latest
from prometheus_client.core import GaugeMetricFamily
from prometheus_client.registry import Collector
from sqlalchemy import text
from starlette.routing import Match

from app.db.session import get_engine

logger = logging.getLogger(__name__)

# --- Tráfico de la API (HU-20) ------------------------------------------------

PETICIONES = Counter(
    "trattoria_http_requests_total",
    "Peticiones HTTP atendidas por la API.",
    ["metodo", "ruta", "estado"],
)
LATENCIA = Histogram(
    "trattoria_http_request_duration_seconds",
    "Tiempo que tarda la API en responder una petición.",
    ["metodo", "ruta"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5),
)
EN_CURSO = Gauge(
    "trattoria_http_requests_en_curso",
    "Peticiones que la réplica está atendiendo en este momento.",
)

# --- Ingreso con reconocimiento facial (HU-21) -------------------------------

INGRESOS_FACIALES = Counter(
    "trattoria_ingreso_facial_total",
    "Intentos de ingreso con reconocimiento facial según el resultado.",
    ["resultado"],
)
COMPARACION_FACIAL = Histogram(
    "trattoria_ingreso_facial_comparacion_seconds",
    "Tiempo que tarda en comparar un descriptor con los rostros registrados.",
    buckets=(0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25),
)
# Se crean en cero para que la gráfica de Grafana exista antes del primer intento.
for _resultado in ("reconocido", "no_reconocido"):
    INGRESOS_FACIALES.labels(_resultado)


def registrar_ingreso_facial(segundos: float, reconocido: bool) -> None:
    COMPARACION_FACIAL.observe(segundos)
    INGRESOS_FACIALES.labels("reconocido" if reconocido else "no_reconocido").inc()


# --- Pedidos por voz con Gemini (IA) -------------------------------------------

VOZ_INTERPRETACIONES = Counter(
    "trattoria_voz_interpretaciones_total",
    "Dictados interpretados, según quién los entendió (gemini o reglas de respaldo) y si venían como audio o texto.",
    ["motor", "origen"],
)
VOZ_LATENCIA = Histogram(
    "trattoria_voz_interpretacion_seconds",
    "Tiempo que tarda en entender un dictado (incluye la llamada a Gemini).",
    ["motor"],
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 30),
)
VOZ_ERRORES = Counter(
    "trattoria_voz_errores_total",
    "Dictados que no se pudieron procesar (audio ilegible, Gemini caído sin respaldo posible).",
    ["origen"],
)
VOZ_PEDIDOS = Counter(
    "trattoria_voz_pedidos_total",
    "Pedidos enviados a cocina por voz, según el dispositivo que los dictó.",
    ["origen"],
)
# Se crean en cero para que las gráficas existan antes del primer dictado.
for _motor in ("gemini", "reglas"):
    for _origen in ("audio", "texto"):
        VOZ_INTERPRETACIONES.labels(_motor, _origen)
for _origen in ("audio", "texto"):
    VOZ_ERRORES.labels(_origen)
for _origen in ("terminal", "web"):
    VOZ_PEDIDOS.labels(_origen)


def registrar_interpretacion_voz(segundos: float, motor: str, origen: str) -> None:
    VOZ_LATENCIA.labels(motor).observe(segundos)
    VOZ_INTERPRETACIONES.labels(motor, origen).inc()


def registrar_error_voz(origen: str) -> None:
    VOZ_ERRORES.labels(origen).inc()


def registrar_pedido_voz(origen: str) -> None:
    VOZ_PEDIDOS.labels(origen).inc()


# --- Datos del restaurante leídos de la base en cada consulta de Prometheus ---

class DatosRestaurante(Collector):
    """Gauges que salen de PostgreSQL: mesas por estado y personas con rostro registrado.

    Si la base no responde, simplemente no se publican estas métricas en esa lectura;
    /metrics sigue funcionando con el resto.
    """

    def describe(self):
        # Prometheus pide los nombres al registrar el collector; así no se consulta la base al arrancar.
        yield GaugeMetricFamily("trattoria_mesas", "Mesas activas según su estado.", labels=["estado"])
        yield GaugeMetricFamily("trattoria_personas_con_rostro", "Personas con rostro registrado.")

    def collect(self):
        try:
            with get_engine().connect() as conexion:
                mesas = conexion.execute(text("SELECT estado, mesas FROM v_mesas_por_estado")).all()
                con_rostro = conexion.execute(
                    text("SELECT count(DISTINCT usuario_id) FROM rostro_plantillas")
                ).scalar_one()
        except Exception:  # noqa: BLE001 - una falla de la base no debe tumbar /metrics
            logger.warning("No se pudieron leer las métricas de la base", exc_info=True)
            return
        familia = GaugeMetricFamily("trattoria_mesas", "Mesas activas según su estado.", labels=["estado"])
        for estado, cantidad in mesas:
            familia.add_metric([estado], cantidad)
        yield familia
        yield GaugeMetricFamily(
            "trattoria_personas_con_rostro",
            "Personas que tienen su rostro registrado para el ingreso facial.",
            value=con_rostro,
        )


REGISTRY.register(DatosRestaurante())


# --- Middleware y endpoint ----------------------------------------------------

def _plantilla_de_ruta(request: Request) -> str:
    """Devuelve la ruta como está declarada (/api/v1/pedidos/{pedido_id}), no la URL real.

    Así cada pedido no crea una serie distinta en Prometheus. Las rutas que no existen
    se agrupan en "sin_ruta".
    """
    ruta = request.scope.get("route")
    if getattr(ruta, "path", None):
        return ruta.path
    for candidata in request.app.router.routes:
        coincide, _ = candidata.matches(request.scope)
        if coincide == Match.FULL:
            return getattr(candidata, "path", "sin_ruta")
    return "sin_ruta"


async def medir_peticiones(request: Request, call_next):
    if request.url.path == "/metrics":
        return await call_next(request)
    EN_CURSO.inc()
    inicio = time.perf_counter()
    estado = 500
    try:
        respuesta = await call_next(request)
        estado = respuesta.status_code
        return respuesta
    finally:
        duracion = time.perf_counter() - inicio
        ruta = _plantilla_de_ruta(request)
        PETICIONES.labels(request.method, ruta, str(estado)).inc()
        LATENCIA.labels(request.method, ruta).observe(duracion)
        EN_CURSO.dec()


router = APIRouter(tags=["Salud"])


@router.get("/metrics", include_in_schema=False)
def metricas() -> Response:
    # No pasa por el Nginx del frontend: solo se lee desde dentro del clúster.
    return Response(generate_latest(REGISTRY), media_type=CONTENT_TYPE_LATEST)
