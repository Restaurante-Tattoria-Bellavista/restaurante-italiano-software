from typing import Literal

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=60)
    password: str = Field(min_length=1, max_length=200)


class FaceLoginRequest(BaseModel):
    descriptor: list[float] = Field(min_length=128, max_length=128)


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
