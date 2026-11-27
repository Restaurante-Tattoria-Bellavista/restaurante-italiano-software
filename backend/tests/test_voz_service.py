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


def test_audio_web_rechaza_audio_vacio():
    from fastapi.testclient import TestClient
    from app.main import app
    r = TestClient(app).post("/api/voz/audio-web", content=b"x", headers={"Content-Type": "audio/wav"})
    assert r.status_code == 422
