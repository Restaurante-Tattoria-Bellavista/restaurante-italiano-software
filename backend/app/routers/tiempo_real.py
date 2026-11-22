import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select

from app.core.config import get_settings
from app.core.realtime import hub
from app.core.security import decode_token
from app.db.session import get_engine
from app.models.usuarios import usuarios

router = APIRouter(tags=["Tiempo real"])

CODIGO_NO_AUTORIZADO = 4401
SEGUNDOS_PARA_AUTENTICAR = 10


def _usuario_activo(token: str) -> bool:
    claims = decode_token(token, get_settings().auth_secret)
    if claims is None:
        return False
    with get_engine().connect() as conexion:
        fila = conexion.execute(
            select(usuarios.c.activo).where(usuarios.c.id == int(claims["sub"]))
        ).first()
    return bool(fila and fila[0])


@router.websocket("/api/ws")
async def tiempo_real(websocket: WebSocket):
    await websocket.accept()
    try:
        primer_mensaje = await asyncio.wait_for(websocket.receive_json(), SEGUNDOS_PARA_AUTENTICAR)
        token = str(primer_mensaje.get("token", ""))
    except Exception:
        await websocket.close(code=CODIGO_NO_AUTORIZADO)
        return

    if not await run_in_threadpool(_usuario_activo, token):
        await websocket.close(code=CODIGO_NO_AUTORIZADO)
        return

    await hub.conectar(websocket)
    try:
        await websocket.send_json({"tipo": "listo"})
        while True:
            # El cliente envia "ping" periodicamente para mantener viva la conexion.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.desconectar(websocket)
