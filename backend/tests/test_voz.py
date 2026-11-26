"""Pruebas del asistente de pedidos por voz (interprete local y respaldo de Gemini)."""
from app.core.config import get_settings
from app.services import voz_service

settings = get_settings()


def _decir(client, texto, borrador=None):
    r = client.post("/api/v1/voz/interpretar", json={"texto": texto, "borrador": borrador})
    assert r.status_code == 200, r.text
    return r.json()


def test_pedido_completo_en_una_frase(api):
    r = _decir(api, "Mesa cinco, quiero dos pizzas margherita y una limonada")
    b = r["borrador"]
    assert b["mesa_numero"] == 5 and r["pregunta"] is None
    assert {(i["nombre"], i["cantidad"]) for i in b["items"]} == {
        ("Pizza Margherita", 2), ("Limonata della Casa", 1)}
    assert r["motor"] == "reglas"


def test_pregunta_por_mesa_y_la_recuerda(api):
    r = _decir(api, "quiero un tiramisu")
    assert r["pregunta"] == "¿Para qué mesa es el pedido?"
    r = _decir(api, "mesa 3", r["borrador"])
    assert r["pregunta"] is None and r["borrador"]["mesa_numero"] == 3
    assert r["borrador"]["items"][0]["nombre"] == "Tiramisu"


def test_producto_ambiguo_pregunta_y_se_resuelve(api):
    r = _decir(api, "mesa 2 una pizza")  # solo hay una pizza: debe resolverse sola
    assert r["pregunta"] is None
    r = _decir(api, "mesa 2 un postre")
    assert r["pregunta"] is not None  # postre: tiramisu o panna cotta, no inventa
    r = _decir(api, "el panna cotta", r["borrador"])
    assert r["pregunta"] is None
    assert r["borrador"]["items"][-1]["nombre"] == "Panna Cotta"


def test_producto_inexistente_no_se_inventa(api):
    r = _decir(api, "mesa 2 una hamburguesa")
    assert r["borrador"]["items"] == []
    assert "hamburguesa" in r["pregunta"]


def test_mesa_inexistente_y_observacion(api):
    r = _decir(api, "mesa 99 una lasagna")
    assert r["borrador"]["mesa_numero"] is None and "99" in r["pregunta"]
    r = _decir(api, "mesa 4 un risotto sin hongos")
    assert r["borrador"]["items"][0]["observacion"] == "sin hongos"


def test_confirmar_crea_pedido_visible_para_cocina(api):
    r = _decir(api, "mesa 6 dos carbonara y un espresso")
    assert _decir(api, "eso es todo", r["borrador"])["confirmar"] is True
    out = api.post("/api/v1/voz/confirmar", json=r["borrador"])
    assert out.status_code == 201, out.text
    pedido = api.get(f"/api/v1/pedidos/{out.json()['pedido_id']}").json()
    detalles = api.get(f"/api/v1/pedidos/{out.json()['pedido_id']}/detalles").json()
    assert pedido["estado"] == "ABIERTO" and len(detalles) == 2
    assert float(pedido["total"]) == 2 * 33000 + 6000
    # Otro dictado para la misma mesa amplia el pedido activo en vez de duplicarlo.
    r2 = _decir(api, "mesa 6 un tiramisu")
    out2 = api.post("/api/v1/voz/confirmar", json=r2["borrador"])
    assert out2.json()["pedido_id"] == out.json()["pedido_id"]


def test_no_confirma_si_falta_informacion(api):
    r = _decir(api, "confirmar")
    assert r["confirmar"] is False and r["pregunta"]
    assert api.post("/api/v1/voz/confirmar", json={"items": []}).status_code == 422


def test_cancelar(api):
    r = _decir(api, "mesa 2 una pizza")
    assert _decir(api, "cancelar", r["borrador"])["borrador"]["items"] == []


def test_gemini_se_valida_y_cae_a_reglas_si_falla(api, monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "x")
    # Gemini "alucina": producto 9999 inexistente, cantidad absurda y mesa inexistente.
    monkeypatch.setattr(voz_service, "_llamar_gemini", lambda *a, **k: {
        "mesa_numero": 77,
        "items": [{"producto_id": 9999, "cantidad": 1}, {"producto_id": 1, "cantidad": 500},
                  {"producto_id": 3, "cantidad": 2, "observacion": "bien caliente"}],
        "aclaracion": None, "confirmar": True, "cancelar": False})
    r = _decir(api, "mesa 77 lo que sea")
    assert r["motor"] == "gemini" and r["confirmar"] is False
    assert [(i["producto_id"], i["cantidad"]) for i in r["borrador"]["items"]] == [(3, 2)]
    assert r["pregunta"]  # avisa lo descartado o pide la mesa

    import urllib.error
    def caido(*a, **k):
        raise urllib.error.URLError("sin red")
    monkeypatch.setattr(voz_service, "_llamar_gemini", caido)
    r = _decir(api, "mesa 3 una pizza margherita")
    assert r["motor"] == "reglas" and r["borrador"]["mesa_numero"] == 3


def test_estado_no_expone_la_clave(api, monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "SECRETA")
    assert "SECRETA" not in api.get("/api/v1/voz/estado").text


# ----------------------------------------------------------- audio (terminal ESP32)

WAV_FALSO = b"RIFF" + b"\x00" * 4000  # solo para probar validaciones y flujo (Gemini simulado)


CLAVE = {"x-device-key": "secreta"}


def test_audio_exige_clave_de_dispositivo(api, monkeypatch):
    # Sin VOZ_DEVICE_KEY en el servidor el endpoint queda cerrado (no hay modo abierto).
    assert api.post("/api/v1/voz/audio", content=WAV_FALSO).status_code == 503
    monkeypatch.setattr(settings, "voz_device_key", "secreta")
    assert api.post("/api/v1/voz/audio", content=WAV_FALSO).status_code == 401
    assert api.post("/api/v1/voz/audio", content=WAV_FALSO, headers={"x-device-key": "otra"}).status_code == 401


def test_audio_valida_tamano_y_requiere_gemini(api, monkeypatch):
    monkeypatch.setattr(settings, "voz_device_key", "secreta")
    assert api.post("/api/v1/voz/audio", content=b"x" * 10, headers=CLAVE).status_code == 422
    assert api.post("/api/v1/voz/audio", content=b"x" * 700_000, headers=CLAVE).status_code == 413
    # Sin GEMINI_API_KEY el audio no se puede entender: error claro, no un 500.
    r = api.post("/api/v1/voz/audio", content=WAV_FALSO, headers={**CLAVE, "content-type": "audio/wav"})
    assert r.status_code == 422 and "Gemini" in r.json()["error"]["message"]
    monkeypatch.setattr(settings, "gemini_api_key", "x")
    monkeypatch.setattr(voz_service, "_llamar_gemini", lambda *a, **k: {
        "mesa_numero": 2, "items": [], "aclaracion": "¿Qué desean?", "transcripcion": "mesa dos"})
    ok = api.post("/api/v1/voz/audio?sesion=cocina-1", content=WAV_FALSO, headers=CLAVE)
    assert ok.status_code == 200 and ok.json()["transcripcion"] == "mesa dos"


def test_audio_mantiene_la_conversacion_por_sesion_y_crea_el_pedido(api, monkeypatch):
    monkeypatch.setattr(settings, "voz_device_key", "secreta")
    monkeypatch.setattr(settings, "gemini_api_key", "x")
    respuestas = iter([
        {"mesa_numero": 4, "items": [{"producto_id": 6, "cantidad": 2}], "aclaracion": None,
         "transcripcion": "mesa cuatro dos carbonaras"},
        {"mesa_numero": 4, "items": [{"producto_id": 6, "cantidad": 2}], "confirmar": True,
         "transcripcion": "eso es todo"},
    ])
    vistos = []

    def falso(texto, borrador, menu, mesas, audio=None, mime="audio/wav"):
        vistos.append((borrador["mesa_numero"], len(borrador["items"]), len(audio)))
        return next(respuestas)

    monkeypatch.setattr(voz_service, "_llamar_gemini", falso)
    r1 = api.post("/api/v1/voz/audio?sesion=esp-a", content=WAV_FALSO, headers=CLAVE).json()
    assert r1["pedido"] is None and r1["transcripcion"] == "mesa cuatro dos carbonaras"
    r2 = api.post("/api/v1/voz/audio?sesion=esp-a", content=WAV_FALSO, headers=CLAVE).json()
    assert vistos[1][:2] == (4, 1), "el segundo audio debe llegar con el borrador del primero"
    assert r2["pedido"]["mesa_numero"] == 4
    detalles = api.get(f"/api/v1/pedidos/{r2['pedido']['pedido_id']}/detalles").json()
    assert detalles[0]["cantidad"] == 2
    assert api.get("/api/v1/cocina/comandas").json()[0]["mesa_numero"] == 4


def test_audio_si_gemini_falla_no_inventa(api, monkeypatch):
    import urllib.error
    monkeypatch.setattr(settings, "voz_device_key", "secreta")
    monkeypatch.setattr(settings, "gemini_api_key", "x")

    def caido(*a, **k):
        raise urllib.error.URLError("sin red")

    monkeypatch.setattr(voz_service, "_llamar_gemini", caido)
    r = api.post("/api/v1/voz/audio", content=WAV_FALSO, headers=CLAVE)
    assert r.status_code == 422 and "audio" in r.json()["error"]["message"].lower()
    assert api.get("/api/v1/cocina/comandas").json() == []


# ------------------------------------------------- latido y estado de la terminal ESP32

def _limpiar_terminales():
    from app.routers import voz as voz_router
    voz_router._TERMINALES.clear()
    return voz_router


def test_latido_exige_clave_de_dispositivo(api, monkeypatch):
    _limpiar_terminales()
    assert api.post("/api/v1/voz/latido", json={}).status_code == 503  # sin clave configurada en el servidor
    monkeypatch.setattr(settings, "voz_device_key", "secreta")
    assert api.post("/api/v1/voz/latido", json={}).status_code == 401
    assert api.post("/api/v1/voz/latido", json={}, headers={"x-device-key": "otra"}).status_code == 401


def test_latido_registra_la_terminal_y_aparece_en_linea(api, monkeypatch):
    _limpiar_terminales()
    monkeypatch.setattr(settings, "voz_device_key", "secreta")
    cuerpo = {"etiqueta": "T01", "wifi_rssi": -61, "ip": "192.168.1.77", "uptime_s": 12, "memoria_libre": 90000}
    assert api.post("/api/v1/voz/latido?sesion=terminal-1", json=cuerpo, headers=CLAVE).status_code == 200
    lista = api.get("/api/v1/voz/terminales").json()
    assert len(lista) == 1
    t = lista[0]
    assert t["sesion"] == "terminal-1" and t["etiqueta"] == "T01" and t["wifi_rssi"] == -61
    assert t["en_linea"] is True and t["segundos_desde_audio"] is None and t["audios"] == 0


def test_terminal_sin_latido_reciente_figura_fuera_de_linea(api, monkeypatch):
    voz_router = _limpiar_terminales()
    monkeypatch.setattr(settings, "voz_device_key", "secreta")
    api.post("/api/v1/voz/latido?sesion=terminal-1", json={}, headers=CLAVE)
    voz_router._TERMINALES["terminal-1"]["visto"] -= voz_router.EN_LINEA_SEGUNDOS + 5
    assert api.get("/api/v1/voz/terminales").json()[0]["en_linea"] is False


def test_latido_rechaza_datos_invalidos(api, monkeypatch):
    _limpiar_terminales()
    monkeypatch.setattr(settings, "voz_device_key", "secreta")
    assert api.post("/api/v1/voz/latido", json={"etiqueta": "<script>"}, headers=CLAVE).status_code == 422
    assert api.post("/api/v1/voz/latido", json={"wifi_rssi": 50}, headers=CLAVE).status_code == 422
    assert api.post("/api/v1/voz/latido?sesion=con espacio", json={}, headers=CLAVE).status_code == 422


def test_un_audio_cuenta_como_actividad_de_la_terminal(api, monkeypatch):
    _limpiar_terminales()
    monkeypatch.setattr(settings, "voz_device_key", "secreta")
    api.post("/api/v1/voz/audio?sesion=terminal-2", content=WAV_FALSO, headers=CLAVE)
    t = api.get("/api/v1/voz/terminales").json()[0]
    assert t["sesion"] == "terminal-2" and t["audios"] == 1 and t["segundos_desde_audio"] is not None


# --------------------------------------------------------- metricas de la IA (Prometheus)

def _valor(nombre, **etiquetas):
    from prometheus_client import REGISTRY
    return REGISTRY.get_sample_value(nombre, etiquetas) or 0


def test_cada_dictado_se_cuenta_y_se_mide(api):
    antes = _valor("trattoria_voz_interpretaciones_total", motor="reglas", origen="texto")
    n_antes = _valor("trattoria_voz_interpretacion_seconds_count", motor="reglas")
    _decir(api, "mesa 2 una pizza")
    assert _valor("trattoria_voz_interpretaciones_total", motor="reglas", origen="texto") == antes + 1
    assert _valor("trattoria_voz_interpretacion_seconds_count", motor="reglas") == n_antes + 1


def test_un_dictado_fallido_cuenta_como_error(api):
    antes = _valor("trattoria_voz_errores_total", origen="texto")
    r = api.post("/api/v1/voz/interpretar", json={"texto": "x" * 601})
    assert r.status_code in (422, 400)
    # la validacion de Pydantic rechaza antes de llegar al servicio: no cuenta; un vacio de servicio si.
    from app.services import voz_service
    import pytest
    with pytest.raises(Exception):
        voz_service.interpretar(None, "   ", None)
    assert _valor("trattoria_voz_errores_total", origen="texto") == antes + 1


def test_los_pedidos_confirmados_se_cuentan_por_origen(api):
    web = _valor("trattoria_voz_pedidos_total", origen="web")
    b = _decir(api, "mesa 4 un tiramisu")["borrador"]
    assert api.post("/api/v1/voz/confirmar", json=b).status_code == 201
    assert _valor("trattoria_voz_pedidos_total", origen="web") == web + 1


def test_las_metricas_de_voz_aparecen_en_metrics(api):
    cuerpo = api.get("/metrics").text
    for nombre in ("trattoria_voz_interpretaciones_total", "trattoria_voz_interpretacion_seconds",
                   "trattoria_voz_errores_total", "trattoria_voz_pedidos_total"):
        assert nombre in cuerpo


def test_el_borrador_de_la_terminal_vive_en_la_base_y_vence(api, monkeypatch):
    """Con varias replicas dos audios caen en pods distintos: el borrador no puede estar en memoria."""
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import update

    from app.db.session import get_db
    from app.main import app
    from app.models.operacion import voz_sesiones

    db = next(app.dependency_overrides[get_db]())
    voz_service._guardar_borrador(db, "esp-x", {"mesa_numero": 6, "items": [], "pendiente": None})
    assert voz_service._sesion_borrador(db, "esp-x")["mesa_numero"] == 6
    vencida = datetime.now(timezone.utc) - timedelta(seconds=voz_service.SESION_TTL_S + 5)
    db.execute(update(voz_sesiones).where(voz_sesiones.c.sesion == "esp-x").values(actualizado_at=vencida))
    db.commit()
    assert voz_service._sesion_borrador(db, "esp-x")["mesa_numero"] is None
    voz_service._olvidar_borrador(db, "esp-x")
    db.close()
