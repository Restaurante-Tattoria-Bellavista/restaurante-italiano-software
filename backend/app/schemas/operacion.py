from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict

EstadoPedido = Literal['ABIERTO','EN_PREPARACION','LISTO','ENTREGADO','PAGADO','CANCELADO']

class PedidoCreate(BaseModel):
    mesa_id: int = Field(gt=0)

class PedidoEstado(BaseModel):
    estado: EstadoPedido

class DetalleCreate(BaseModel):
    producto_id: int = Field(gt=0)
    cantidad: int = Field(gt=0)
    observacion: str | None = Field(None,max_length=250)

class DetalleUpdate(BaseModel):
    cantidad: int = Field(gt=0)
    observacion: str | None = Field(None,max_length=250)

class PedidoRead(BaseModel):
    id: int
    mesa_id: int
    estado: EstadoPedido
    total: Decimal
    model_config = ConfigDict(from_attributes=True)

class DetalleRead(DetalleCreate):
    id: int
    pedido_id: int
    precio_unitario: Decimal
    subtotal: Decimal
    model_config = ConfigDict(from_attributes=True)

class ConfigUpdate(BaseModel):
    nombre: str | None = Field(None,min_length=1,max_length=150)
    especialidad: str | None = Field(None,min_length=1,max_length=120)
    moneda: str | None = Field(None,min_length=1,max_length=10)
    ciudad: str | None = Field(None,max_length=120)
    telefono: str | None = Field(None,max_length=40)
    direccion: str | None = Field(None,max_length=200)
    horario: str | None = Field(None,max_length=160)

class ConfigRead(BaseModel):
    id: int
    nombre: str
    especialidad: str
    moneda: str
    ciudad: str | None = None
    telefono: str | None = None
    direccion: str | None = None
    horario: str | None = None
