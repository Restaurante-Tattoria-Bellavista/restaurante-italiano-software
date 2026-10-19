from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

EstadoReserva = Literal['PENDIENTE', 'CONFIRMADA', 'EN_MESA', 'COMPLETADA', 'CANCELADA', 'NO_ASISTIO']

class ClienteCreate(BaseModel):
    nombre: str = Field(min_length=1, max_length=150)
    telefono: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=150, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    observaciones: str | None = None
    activo: bool = True

class ClienteUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=150)
    telefono: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=150, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    observaciones: str | None = None
    activo: bool | None = None

class ClienteRead(ClienteCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)

class ReservaCreate(BaseModel):
    mesa_id: int = Field(gt=0)
    cliente_id: int = Field(gt=0)
    fecha_hora: datetime
    personas: int = Field(gt=0)
    observaciones: str | None = None

    @field_validator('fecha_hora')
    @classmethod
    def fecha_con_zona(cls, value):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError('fecha_hora debe incluir zona horaria')
        if value.astimezone(timezone.utc) <= datetime.now(timezone.utc):
            raise ValueError('fecha_hora debe ser futura')
        return value

class ReservaUpdate(BaseModel):
    mesa_id: int | None = Field(default=None, gt=0)
    cliente_id: int | None = Field(default=None, gt=0)
    fecha_hora: datetime | None = None
    personas: int | None = Field(default=None, gt=0)
    observaciones: str | None = None

    @field_validator('fecha_hora')
    @classmethod
    def fecha_con_zona(cls, value):
        if value is None:
            raise ValueError('fecha_hora no puede ser null')
        return ReservaCreate.fecha_con_zona(value)

class ReservaEstado(BaseModel):
    estado: EstadoReserva

class ReservaRead(BaseModel):
    id: int
    mesa_id: int
    cliente_id: int
    fecha_hora: datetime
    personas: int
    estado: EstadoReserva
    observaciones: str | None = None
    model_config = ConfigDict(from_attributes=True)
