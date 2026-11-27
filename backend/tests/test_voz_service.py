from app.services import voz_service as v
from app.services.voz_service import Producto

MENU = [
    Producto(1, "Bruschetta al Pomodoro", "ENTRADA", True),
    Producto(4, "Lasagna della Casa", "PLATO_FUERTE", True),
]


def test_reglas_entiende_mesa_y_cantidad():
    r = v._interpretar_reglas("mesa 3 quiero dos lasagna", v.borrador_vacio(), MENU, {1, 2, 3})
    assert r["borrador"]["mesa_numero"] == 3
    assert r["borrador"]["items"][0]["producto_id"] == 4
    assert r["borrador"]["items"][0]["cantidad"] == 2


def test_borrador_acota_cantidades_y_descarta_basura():
    b = v._limpiar_borrador({"mesa_numero": "5", "items": [
        {"producto_id": 1, "cantidad": 999}, {"basura": True}]})
    assert b["mesa_numero"] == 5
    assert len(b["items"]) == 1 and b["items"][0]["cantidad"] == v.MAX_CANTIDAD


def test_sesiones_se_reinician():
    v._sesiones["web-x"] = ({"mesa_numero": 1, "items": [], "pendiente": None}, 0)
    v.reiniciar_sesion("web-x")
    assert "web-x" not in v._sesiones


def _cliente():
    """Cliente sin base de datos: las pruebas de seguridad se resuelven antes de usar la BD."""
    from fastapi.testclient import TestClient
    from app.db.session import get_db
    from app.main import app
    app.dependency_overrides[get_db] = lambda: iter([None])
    return TestClient(app)


def test_voz_web_exige_sesion_de_usuario():
    c = _cliente()
    assert c.post("/api/voz/audio-web", content=b"x" * 3000).status_code == 401
    assert c.post("/api/voz/confirmar", json={"mesa_numero": 1, "items": []}).status_code == 401


def test_terminal_esp32_exige_clave_de_dispositivo(monkeypatch):
    from app.core.config import get_settings
    c = _cliente()
    s = get_settings()
    monkeypatch.setattr(s, "voz_device_key", None)
    assert c.post("/api/voz/audio", content=b"x" * 3000).status_code == 503
    monkeypatch.setattr(s, "voz_device_key", "clave-de-prueba")
    assert c.post("/api/voz/audio", content=b"x" * 3000).status_code == 401
    assert c.post("/api/voz/audio", content=b"x", headers={"X-Device-Key": "clave-de-prueba"}).status_code == 422
