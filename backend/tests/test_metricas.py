from fastapi.testclient import TestClient

from app.core import metricas
from app.main import app

client = TestClient(app)


def _valor(nombre, **etiquetas):
    return metricas.REGISTRY.get_sample_value(nombre, etiquetas) or 0


def test_metrics_responde_en_formato_prometheus():
    response = client.get("/metrics")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert "trattoria_http_requests_total" in response.text
    assert "trattoria_ingreso_facial_total" in response.text


def test_cuenta_peticiones_por_plantilla_de_ruta():
    antes = _valor("trattoria_http_requests_total", metodo="GET", ruta="/health", estado="200")
    client.get("/health")
    despues = _valor("trattoria_http_requests_total", metodo="GET", ruta="/health", estado="200")
    assert despues == antes + 1


def test_rutas_inexistentes_no_crean_series_nuevas():
    client.get("/no-existe-123")
    client.get("/no-existe-456")
    texto = client.get("/metrics").text
    assert "/no-existe-123" not in texto
    assert 'ruta="sin_ruta"' in texto


def test_metrics_no_sale_en_la_documentacion():
    assert "/metrics" not in client.get("/openapi.json").json()["paths"]


def test_registrar_ingreso_facial():
    antes = _valor("trattoria_ingreso_facial_total", resultado="no_reconocido")
    metricas.registrar_ingreso_facial(0.002, reconocido=False)
    assert _valor("trattoria_ingreso_facial_total", resultado="no_reconocido") == antes + 1
