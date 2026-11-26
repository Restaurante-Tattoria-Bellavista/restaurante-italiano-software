from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=60)
    password: str = Field(min_length=1, max_length=200)


PoseRostro = Literal["FRENTE", "IZQUIERDA", "DERECHA", "ARRIBA", "ABAJO"]


class FaceChallengeRead(BaseModel):
    challenge_id: str
    poses: list[PoseRostro]
    expira_en: int


class CapturaFacial(BaseModel):
    pose: PoseRostro
    descriptor: list[float] = Field(min_length=128, max_length=128)


class FaceLoginRequest(BaseModel):
    challenge_id: str = Field(min_length=16, max_length=80)
    capturas: list[CapturaFacial] = Field(min_length=1, max_length=5)
    # Opcional: si se envia, se verifica 1:1 contra ese usuario (mas seguro y con bloqueo de cuenta).
    username: str | None = Field(default=None, min_length=3, max_length=60)


class UsuarioRead(BaseModel):
    id: int
    username: str
    nombre: str
    rol: str
    activo: bool
    tiene_rostro: bool = False


class SesionRead(BaseModel):
    token: str
    token_type: str = "bearer"
    usuario: UsuarioRead


class UsuarioCreate(BaseModel):
    username: str = Field(min_length=3, max_length=60, pattern=r"^[a-z0-9._-]+$")
    nombre: str = Field(min_length=2, max_length=120)
    rol: str = Field(pattern=r"^(ADMIN|PERSONAL)$")
    password: str = Field(min_length=8, max_length=200)


class PlantillaRostro(BaseModel):
    pose: Literal["FRENTE", "IZQUIERDA", "DERECHA", "ARRIBA", "ABAJO"]
    descriptor: list[float] = Field(min_length=128, max_length=128)


class RostroUpdate(BaseModel):
    plantillas: list[PlantillaRostro] = Field(min_length=3, max_length=5)


class SolicitudCreate(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    username: str = Field(min_length=3, max_length=60, pattern=r"^[a-z0-9._-]+$")
    password: str = Field(min_length=8, max_length=200)

    @field_validator("username", mode="before")
    @classmethod
    def _normalizar_usuario(cls, valor):
        return valor.strip().lower() if isinstance(valor, str) else valor

    @field_validator("nombre", mode="before")
    @classmethod
    def _normalizar_nombre(cls, valor):
        return valor.strip() if isinstance(valor, str) else valor


class SolicitudEnviada(BaseModel):
    mensaje: str


class SolicitudRead(BaseModel):
    id: int
    username: str
    nombre: str
    estado: Literal["PENDIENTE", "APROBADA", "RECHAZADA"]
    created_at: datetime
    resuelta_at: datetime | None = None
    resuelta_por: str | None = None
    motivo: str | None = None


class AprobarSolicitud(BaseModel):
    rol: Literal["ADMIN", "PERSONAL"] = "PERSONAL"


class RechazarSolicitud(BaseModel):
    motivo: str | None = Field(default=None, max_length=200)
