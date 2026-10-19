from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

Estado = Literal["LIBRE", "OCUPADA", "RESERVADA", "FUERA_DE_SERVICIO"]
Zona = Literal["SALON", "TERRAZA", "VIP", "BAR", "OTRA"]
Forma = Literal["ROUND", "RECT", "SMALL"]
Categoria = Literal["ENTRADA", "PLATO_FUERTE", "BEBIDA", "POSTRE", "OTRO"]

class MesaCreate(BaseModel):
    numero: int = Field(ge=1)
    capacidad: int = Field(gt=0)
    ubicacion: str | None = Field(default=None, max_length=100)
    estado: Estado = "LIBRE"
    activo: bool = True

class MesaUpdate(BaseModel):
    numero: int | None = Field(default=None, ge=1)
    capacidad: int | None = Field(default=None, gt=0)
    ubicacion: str | None = Field(default=None, max_length=100)
    estado: Estado | None = None
    activo: bool | None = None

class MesaRead(MesaCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)

class LayoutUpsert(BaseModel):
    zona: Zona = "SALON"
    pos_x: Decimal = Field(ge=0, le=100, decimal_places=2)
    pos_y: Decimal = Field(ge=0, le=100, decimal_places=2)
    forma: Forma = "ROUND"

class LayoutRead(LayoutUpsert):
    mesa_id: int

class ProductoCreate(BaseModel):
    nombre: str = Field(min_length=1, max_length=150)
    descripcion: str | None = None
    precio: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    categoria: Categoria = "OTRO"
    disponible: bool = True

class ProductoUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=150)
    descripcion: str | None = None
    precio: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    categoria: Categoria | None = None
    disponible: bool | None = None

class ProductoRead(ProductoCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)
