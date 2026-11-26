"""Pruebas de las comandas de cocina y de las reglas del pedido por voz sobre la mesa.

Los ids de mesa sembrados en conftest coinciden con su numero (1..12).
"""
import time


def _pedido(api, mesa, productos):
    pid = api.post("/api/v1/pedidos", json={"mesa_id": mesa}).json()["id"]
    for producto_id, cantidad, obs in productos:
        r = api.post(
            f"/api/v1/pedidos/{pid}/detalles",
            json={"producto_id": producto_id, "cantidad": cantidad, "observacion": obs},
        )
        assert r.status_code == 201, r.text
    return pid


def test_comandas_traen_mesa_y_productos_en_una_sola_llamada(api):
    pid = _pedido(api, 5, [(3, 2, "sin albahaca"), (7, 1, None)])
    comandas = api.get("/api/v1/cocina/comandas").json()
    assert len(comandas) == 1
    c = comandas[0]
    assert c["id"] == pid and c["mesa_numero"] == 5 and c["estado"] == "ABIERTO"
    assert [(i["nombre"], i["cantidad"], i["observacion"]) for i in c["items"]] == [
        ("Pizza Margherita", 2, "sin albahaca"), ("Limonata della Casa", 1, None)]
    assert {i["categoria"] for i in c["items"]} == {"PLATO_FUERTE", "BEBIDA"}


def test_comandas_ocultan_pedidos_vacios_y_los_mas_antiguos_van_primero(api):
    vacio = api.post("/api/v1/pedidos", json={"mesa_id": 1}).json()["id"]
    primero = _pedido(api, 2, [(1, 1, None)])
    time.sleep(0.01)
    segundo = _pedido(api, 3, [(2, 1, None)])
    ids = [c["id"] for c in api.get("/api/v1/cocina/comandas").json()]
    assert ids == [primero, segundo] and vacio not in ids


def test_flujo_de_estados_y_salida_de_cocina(api):
    pid = _pedido(api, 4, [(4, 1, None)])
    for estado in ("EN_PREPARACION", "LISTO"):
        assert api.patch(f"/api/v1/pedidos/{pid}/estado", json={"estado": estado}).status_code == 200
        assert api.get("/api/v1/cocina/comandas").json()[0]["estado"] == estado
    # Saltarse un paso no esta permitido.
    assert api.patch(f"/api/v1/pedidos/{pid}/estado", json={"estado": "PAGADO"}).status_code == 409
    # Entregado ya no aparece en cocina.
    assert api.patch(f"/api/v1/pedidos/{pid}/estado", json={"estado": "ENTREGADO"}).status_code == 200
    assert api.get("/api/v1/cocina/comandas").json() == []


def test_voz_no_modifica_un_pedido_que_ya_esta_en_cocina(api):
    item = {"producto_id": 6, "nombre": "Carbonara", "cantidad": 1}
    out = api.post("/api/v1/voz/confirmar", json={"mesa_numero": 6, "items": [item]})
    assert out.status_code == 201
    pid = out.json()["pedido_id"]
    assert api.patch(f"/api/v1/pedidos/{pid}/estado", json={"estado": "EN_PREPARACION"}).status_code == 200
    otra = api.post(
        "/api/v1/voz/confirmar",
        json={"mesa_numero": 6, "items": [{"producto_id": 9, "nombre": "Tiramisu", "cantidad": 1}]},
    )
    assert otra.status_code == 409 and "en preparacion" in otra.json()["error"]["message"]


def test_voz_suma_cantidad_si_el_producto_ya_estaba_en_el_pedido(api):
    item = {"producto_id": 7, "nombre": "Limonada", "cantidad": 2}
    a = api.post("/api/v1/voz/confirmar", json={"mesa_numero": 8, "items": [item]}).json()["pedido_id"]
    b = api.post("/api/v1/voz/confirmar", json={"mesa_numero": 8, "items": [item]}).json()["pedido_id"]
    assert a == b
    detalles = api.get(f"/api/v1/pedidos/{a}/detalles").json()
    assert len(detalles) == 1 and detalles[0]["cantidad"] == 4
    assert float(api.get(f"/api/v1/pedidos/{a}").json()["total"]) == 4 * 9000
