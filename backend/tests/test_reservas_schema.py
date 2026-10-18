from datetime import datetime, timedelta, timezone
import pytest
from pydantic import ValidationError
from app.schemas.reservas import ClienteCreate, ReservaCreate, ReservaEstado
from app.routers.reservas import TRANSICIONES, VENTANA

def test_cliente_valido():
    assert ClienteCreate(nombre='Ana', email='ana@example.com').activo

def test_cliente_email_invalido():
    with pytest.raises(ValidationError):
        ClienteCreate(nombre='Ana', email='incorrecto')

def test_cliente_nombre_vacio():
    with pytest.raises(ValidationError):
        ClienteCreate(nombre='')

def test_personas_positivas():
    with pytest.raises(ValidationError):
        ReservaCreate(mesa_id=1, cliente_id=1, personas=0, fecha_hora=datetime.now(timezone.utc) + timedelta(days=1))

def test_fecha_con_zona():
    with pytest.raises(ValidationError):
        ReservaCreate(mesa_id=1, cliente_id=1, personas=1, fecha_hora=datetime(2030, 1, 1))

def test_fecha_futura():
    with pytest.raises(ValidationError):
        ReservaCreate(mesa_id=1, cliente_id=1, personas=1, fecha_hora=datetime.now(timezone.utc) - timedelta(days=1))

def test_estado_invalido():
    with pytest.raises(ValidationError):
        ReservaEstado(estado='DESCONOCIDO')

def test_transiciones():
    assert 'CONFIRMADA' in TRANSICIONES['PENDIENTE']
    assert 'PENDIENTE' not in TRANSICIONES['COMPLETADA']
    assert VENTANA == timedelta(hours=2)
