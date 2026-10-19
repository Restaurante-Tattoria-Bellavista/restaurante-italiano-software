from decimal import Decimal
from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
)


Moneda = Literal["COP", "USD", "EUR"]


class RestauranteConfigBase(BaseModel):
    nombre: str = Field(
        min_length=2,
        max_length=150,
    )

    nit: str | None = Field(
        default=None,
        max_length=30,
    )

    telefono: str = Field(
        min_length=7,
        max_length=30,
    )

    correo: EmailStr

    direccion: str = Field(
        min_length=5,
        max_length=200,
    )

    ciudad: str = Field(
        min_length=2,
        max_length=100,
    )

    moneda: Moneda = "COP"

    zona_horaria: str = Field(
        default="America/Bogota",
        min_length=3,
        max_length=80,
    )

    porcentaje_servicio: Decimal = Field(
        default=Decimal("10.00"),
        ge=0,
        le=100,
        max_digits=5,
        decimal_places=2,
    )

    @field_validator(
        "nombre",
        "telefono",
        "direccion",
        "ciudad",
        "zona_horaria",
    )
    @classmethod
    def limpiar_campos_obligatorios(
        cls,
        valor: str,
    ) -> str:
        valor_limpio = valor.strip()

        if not valor_limpio:
            raise ValueError(
                "El campo no puede estar vacío."
            )

        return valor_limpio

    @field_validator("nit")
    @classmethod
    def limpiar_nit(
        cls,
        valor: str | None,
    ) -> str | None:
        if valor is None:
            return None

        valor_limpio = valor.strip()

        return valor_limpio or None


class RestauranteConfigUpdate(
    RestauranteConfigBase,
):
    pass


class RestauranteConfigRead(
    RestauranteConfigBase,
):
    id: int

    model_config = ConfigDict(
        from_attributes=True,
    )