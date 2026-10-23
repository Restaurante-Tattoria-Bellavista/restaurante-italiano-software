import pytest
from pydantic import ValidationError
from app.schemas.operacion import PedidoCreate, DetalleCreate, DetalleUpdate, PedidoEstado, ConfigUpdate
from app.routers.operacion import TRANSICIONES, ACTIVOS

def test_pedido_mesa_positiva():
    with pytest.raises(ValidationError): PedidoCreate(mesa_id=0)

def test_detalle_cantidad_positiva():
    with pytest.raises(ValidationError): DetalleCreate(producto_id=1,cantidad=0)

def test_editar_detalle_cantidad_positiva():
    with pytest.raises(ValidationError): DetalleUpdate(cantidad=-2)

def test_estado_valido():
    with pytest.raises(ValidationError): PedidoEstado(estado='NO_EXISTE')

def test_transiciones_documentadas():
    assert 'EN_PREPARACION' in TRANSICIONES['ABIERTO']
    assert 'PAGADO' in TRANSICIONES['ENTREGADO']
    assert not TRANSICIONES['PAGADO']

def test_pedido_activo():
    assert 'CANCELADO' not in ACTIVOS

def test_configuracion_validacion():
    with pytest.raises(ValidationError): ConfigUpdate(moneda='')
