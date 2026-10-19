import pytest
from pydantic import ValidationError
from app.schemas.catalogo import MesaCreate, LayoutUpsert, ProductoCreate

def test_mesa_valida():
    assert MesaCreate(numero=1, capacidad=4).estado == "LIBRE"

@pytest.mark.parametrize("capacidad", [0, -1])
def test_capacidad_invalida(capacidad):
    with pytest.raises(ValidationError):
        MesaCreate(numero=1, capacidad=capacidad)

def test_layout_rango():
    with pytest.raises(ValidationError):
        LayoutUpsert(pos_x=101, pos_y=50)

def test_categoria_producto():
    with pytest.raises(ValidationError):
        ProductoCreate(nombre="Pasta", precio=100, categoria="INVALIDO")

def test_precio_producto():
    with pytest.raises(ValidationError):
        ProductoCreate(nombre="Pasta", precio=0)
