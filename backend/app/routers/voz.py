"""Pedidos por voz: asistente para meseros (navegador) y terminal ESP32."""
import hmac
import time

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.services import voz_service

# Rutas para usuarios con sesion (la pagina "Pedido por voz"); se montan con proteccion en main.py.
router = APIRouter(prefix="/api/v1/voz", tags=["Pedidos por voz"])
# Ruta para la terminal ESP32: no hay usuario, se autentica con X-Device-Key.
dispositivo_router = APIRouter(prefix="/api/v1/voz", tags=["Pedidos por voz"])

# Estado de las terminales ESP32 (ultimo latido y ultimo audio), en memoria del proceso. Con varias replicas
# cada una ve solo los latidos que recibio; como la terminal avisa cada ~30 s, en pocos segundos todas lo ven.
_TERMINALES: dict[str, dict] = {}
EN_LINEA_SEGUNDOS = 90

MAX_AUDIO_BYTES = 600_000  # ~18 s de WAV mono 16 kHz 16 bit
MIN_AUDIO_BYTES = 2_000


class ItemBorrador(BaseModel):
    producto_id: int
    nombre: str = ""
    cantidad: int = Field(ge=1, le=voz_service.MAX_CANTIDAD)
    observacion: str | None = Field(default=None, max_length=250)


class Borrador(BaseModel):
    mesa_numero: int | None = None
    items: list[ItemBorrador] = []
    pendiente: dict | None = None


class Latido(BaseModel):
    """Lo que la terminal reporta de si misma cada pocos segundos."""
    etiqueta: str | None = Field(default=None, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    wifi_rssi: int | None = Field(default=None, ge=-120, le=0)
    ip: str | None = Field(default=None, max_length=45)
    uptime_s: int | None = Field(default=None, ge=0)
    memoria_libre: int | None = Field(default=None, ge=0)


class InterpretarRequest(BaseModel):
    texto: str = Field(min_length=1, max_length=600)
    borrador: Borrador | None = None


@router.get("/estado")
def estado_motor():
    """Indica que motor de interpretacion se usara (sin exponer la clave)."""
    cfg = get_settings()
    return {"motor": "gemini" if cfg.gemini_api_key else "reglas", "modelo": cfg.gemini_model}


@router.get("/terminales")
def listar_terminales():
    """Terminales ESP32 que han reportado (latido) y si siguen en linea."""
    ahora = time.time()
    resultado = []
    for sesion, datos in sorted(_TERMINALES.items()):
        desde = int(ahora - datos["visto"])
        resultado.append({
            "sesion": sesion,
            "etiqueta": datos.get("etiqueta"),
            "wifi_rssi": datos.get("wifi_rssi"),
            "ip": datos.get("ip"),
            "uptime_s": datos.get("uptime_s"),
            "memoria_libre": datos.get("memoria_libre"),
            "segundos_desde_latido": desde,
            "en_linea": desde <= EN_LINEA_SEGUNDOS,
            "segundos_desde_audio": int(ahora - datos["audio"]) if datos.get("audio") else None,
            "audios": datos.get("audios", 0),
        })
    return resultado


@router.post("/interpretar")
def interpretar(data: InterpretarRequest, db: Session = Depends(get_db)):
    """Entiende lo dictado y devuelve el borrador actualizado, la pregunta de aclaracion
    (si falta algo) y el mensaje que debe pronunciar el altavoz."""
    return voz_service.interpretar(db, data.texto, data.borrador.model_dump() if data.borrador else None)


@router.post("/confirmar", status_code=status.HTTP_201_CREATED)
def confirmar(data: Borrador, db: Session = Depends(get_db)):
    """Crea (o amplia) el pedido de la mesa; queda visible en Cocina."""
    return voz_service.confirmar_pedido(db, data.model_dump())


def _verificar_dispositivo(clave: str | None) -> None:
    esperada = get_settings().voz_device_key
    if not esperada:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Terminal de voz no configurada en el servidor.")
    if not clave or not hmac.compare_digest(clave, esperada):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Clave de dispositivo invalida.")


@dispositivo_router.post("/latido", summary="Latido de la terminal ESP32 (en linea, WiFi, etiqueta BLE)")
def recibir_latido(
    datos: Latido,
    sesion: str = Query(default="esp32", min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$"),
    x_device_key: str | None = Header(default=None),
):
    _verificar_dispositivo(x_device_key)
    anterior = _TERMINALES.get(sesion, {})
    # Con muchas sesiones distintas el diccionario no debe crecer sin limite.
    if sesion not in _TERMINALES and len(_TERMINALES) >= 50:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Demasiadas terminales registradas.")
    _TERMINALES[sesion] = {**anterior, **datos.model_dump(), "visto": time.time()}
    return {"ok": True}


@dispositivo_router.post("/audio", summary="Audio de la terminal ESP32")
async def interpretar_audio(
    request: Request,
    sesion: str = Query(default="esp32", min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$"),
    x_device_key: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Recibe audio WAV (cuerpo crudo, Content-Type audio/wav), lo entiende con Gemini y, si el
    pedido queda confirmado, lo crea y lo manda a cocina. El borrador de la conversacion se
    guarda en el servidor por `sesion`."""
    _verificar_dispositivo(x_device_key)

    # Se corta por Content-Length antes de leer el cuerpo para no cargar audio enorme en memoria.
    declarado = request.headers.get("content-length")
    if declarado and declarado.isdigit() and int(declarado) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "El audio es demasiado largo.")
    audio = await request.body()
    if len(audio) < MIN_AUDIO_BYTES:
        raise HTTPException(422, "El audio esta vacio o es demasiado corto.")
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "El audio es demasiado largo.")

    terminal = _TERMINALES.setdefault(sesion, {"visto": time.time()})
    terminal["audio"] = time.time()
    terminal["audios"] = terminal.get("audios", 0) + 1

    mime = request.headers.get("content-type", "audio/wav").split(";")[0].strip() or "audio/wav"
    return voz_service.interpretar_audio_sesion(db, sesion, audio, mime)
