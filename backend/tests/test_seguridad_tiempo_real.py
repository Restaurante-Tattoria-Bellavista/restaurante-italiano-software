import asyncio

import pytest
from fastapi import HTTPException

from app.core.rate_limit import LimitadorIntentos
from app.core.realtime import HubTiempoReal


def test_limitador_bloquea_al_superar_el_maximo():
    limitador = LimitadorIntentos(maximo=3, ventana_segundos=600)
    for _ in range(3):
        limitador.registrar_fallo("1.2.3.4")
    with pytest.raises(HTTPException) as exc:
        limitador.verificar("1.2.3.4")
    assert exc.value.status_code == 429
    assert "Retry-After" in exc.value.headers


def test_limitador_separa_claves():
    limitador = LimitadorIntentos(maximo=1, ventana_segundos=600)
    limitador.registrar_fallo("ip-a")
    limitador.verificar("ip-b")  # otra IP no se ve afectada


def test_hub_publicar_sin_loop_no_falla():
    hub = HubTiempoReal()
    hub.publicar({"tipo": "cambio", "tablas": ["mesas"]})  # no hay loop ni clientes


class _WebSocketFalso:
    def __init__(self, falla=False):
        self.enviados = []
        self.falla = falla

    async def send_json(self, mensaje):
        if self.falla:
            raise RuntimeError("cliente desconectado")
        self.enviados.append(mensaje)


def test_hub_difunde_y_descarta_clientes_caidos():
    async def escenario():
        hub = HubTiempoReal()
        bueno = _WebSocketFalso()
        caido = _WebSocketFalso(falla=True)
        await hub.conectar(bueno)
        await hub.conectar(caido)
        await hub.difundir({"tipo": "cambio", "tablas": ["mesas"]})
        assert bueno.enviados == [{"tipo": "cambio", "tablas": ["mesas"]}]
        assert hub.conectados() == 1

    asyncio.run(escenario())


def test_los_aciertos_no_consumen_el_cupo():
    limitador = LimitadorIntentos(maximo=2, ventana_segundos=600)
    for _ in range(10):
        limitador.verificar("ip-c")
