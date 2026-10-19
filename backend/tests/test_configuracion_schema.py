from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.configuracion import (
    RestauranteConfigUpdate,
)


def crear_configuracion_valida():
    return {
        "nombre": "Trattoria Bellavista",
        "nit": "900123456-7",
        "telefono": "3001234567",
        "correo": "contacto@bellavista.com",
        "direccion": "Calle 10 # 20-30",
        "ciudad": "Bogotá",
        "moneda": "COP",
        "zona_horaria": "America/Bogota",
        "porcentaje_servicio": 10,
    }


def test_configuracion_valida():
    configuracion = RestauranteConfigUpdate(
        **crear_configuracion_valida()
    )

    assert (
        configuracion.nombre
        == "Trattoria Bellavista"
    )
    assert configuracion.moneda == "COP"
    assert (
        configuracion.porcentaje_servicio
        == Decimal("10")
    )


def test_limpia_espacios_de_texto():
    datos = crear_configuracion_valida()
    datos["nombre"] = "  Trattoria Bellavista  "

    configuracion = RestauranteConfigUpdate(
        **datos
    )

    assert (
        configuracion.nombre
        == "Trattoria Bellavista"
    )


def test_rechaza_correo_invalido():
    datos = crear_configuracion_valida()
    datos["correo"] = "correo-invalido"

    with pytest.raises(ValidationError):
        RestauranteConfigUpdate(**datos)


def test_rechaza_porcentaje_mayor_a_cien():
    datos = crear_configuracion_valida()
    datos["porcentaje_servicio"] = 101

    with pytest.raises(ValidationError):
        RestauranteConfigUpdate(**datos)


def test_rechaza_nombre_vacio():
    datos = crear_configuracion_valida()
    datos["nombre"] = "   "

    with pytest.raises(ValidationError):
        RestauranteConfigUpdate(**datos)