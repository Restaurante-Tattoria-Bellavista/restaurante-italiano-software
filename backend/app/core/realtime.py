"""Hub de eventos en tiempo real.

Las escrituras en la base llaman a `hub.publicar` desde hilos de trabajo de FastAPI;
el envio a los WebSockets se programa en el event loop principal.
"""
import asyncio

from fastapi import WebSocket


class HubTiempoReal:
    def __init__(self) -> None:
        self._conexiones: set[WebSocket] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def registrar_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def conectados(self) -> int:
        return len(self._conexiones)

    async def conectar(self, websocket: WebSocket) -> None:
        self._conexiones.add(websocket)

    def desconectar(self, websocket: WebSocket) -> None:
        self._conexiones.discard(websocket)

    async def difundir(self, mensaje: dict) -> None:
        for websocket in list(self._conexiones):
            try:
                await websocket.send_json(mensaje)
            except Exception:
                self._conexiones.discard(websocket)

    def publicar(self, mensaje: dict) -> None:
        """Seguro desde cualquier hilo. No hace nada si no hay clientes o el loop no esta listo."""
        if self._loop is None or not self._conexiones:
            return
        asyncio.run_coroutine_threadsafe(self.difundir(mensaje), self._loop)


hub = HubTiempoReal()
