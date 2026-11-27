import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.services import voz_service

router = APIRouter(prefix="/api/voz", tags=["Pedidos por voz"])
MAX_AUDIO_BYTES = 2_000_000  # ~60 s de WAV mono 16 kHz (el ESP32 envia <= 80 KB)


class ItemBorrador(BaseModel):
    producto_id: int
    nombre: str = ""
    cantidad: int = Field(ge=1, le=voz_service.MAX_CANTIDAD)
    observacion: str | None = Field(default=None, max_length=250)


class Borrador(BaseModel):
    mesa_numero: int | None = None
    items: list[ItemBorrador] = []
    pendiente: dict | None = None


class InterpretarRequest(BaseModel):
    texto: str = Field(min_length=1, max_length=600)
    borrador: Borrador | None = None


@router.get("/estado")
def estado_motor():
    s = get_settings()
    return {"motor": "gemini" if s.gemini_api_key else "reglas", "modelo": s.gemini_model}


@router.post("/interpretar")
def interpretar(data: InterpretarRequest, db: Session = Depends(get_db)):
    return voz_service.interpretar(db, data.texto, data.borrador.model_dump() if data.borrador else None)


@router.post("/confirmar")
def confirmar(data: Borrador, db: Session = Depends(get_db)):
    return voz_service.confirmar_pedido(db, data.model_dump())


async def _procesar_audio(request: Request, sesion: str, db: Session):
    audio = await request.body()
    if len(audio) < 2000:
        raise HTTPException(status_code=422, detail="El audio esta vacio o es demasiado corto.")
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="El audio es demasiado largo.")
    mime = request.headers.get("content-type", "audio/wav").split(";")[0].strip() or "audio/wav"
    return voz_service.interpretar_audio_sesion(db, sesion, audio, mime)


SESION_QUERY = Query(default="esp32", min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")


@router.post("/audio")
async def interpretar_audio(
    request: Request,
    sesion: str = SESION_QUERY,
    x_device_key: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Terminal de voz (ESP32): audio WAV crudo; el borrador vive en el servidor por `sesion`.
    Si VOZ_DEVICE_KEY esta definida, exige la cabecera X-Device-Key."""
    clave = get_settings().voz_device_key
    if clave and not hmac.compare_digest(x_device_key or "", clave):
        raise HTTPException(status_code=401, detail="Clave de dispositivo invalida.")
    return await _procesar_audio(request, sesion, db)


@router.post("/audio-web")
async def interpretar_audio_web(
    request: Request,
    sesion: str = SESION_QUERY,
    db: Session = Depends(get_db),
):
    """Pagina web: mismo proceso que /audio pero sin clave de dispositivo (la clave no puede
    viajar en el navegador). Queda al mismo nivel de acceso que el resto de la API."""
    return await _procesar_audio(request, f"web-{sesion}"[:40], db)


@router.delete("/sesion/{sesion}", status_code=204)
def reiniciar_sesion(sesion: str):
    """Descarta el borrador de una sesion de la pagina web (al confirmar o cancelar)."""
    voz_service.reiniciar_sesion(f"web-{sesion}"[:40])
