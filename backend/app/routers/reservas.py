from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, insert, update, func, and_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.catalogo import mesas
from app.models.reservas import clientes, reservas
from app.schemas.reservas import (
    ClienteCreate, ClienteUpdate, ClienteRead,
    ReservaCreate, ReservaUpdate, ReservaEstado, ReservaRead,
)

router = APIRouter(prefix='/api/v1', tags=['Clientes y reservas'])

# Duracion fija documentada: bloqueo desde 2 horas antes hasta 2 horas despues.
VENTANA = timedelta(hours=2)
ACTIVAS = ('PENDIENTE', 'CONFIRMADA', 'EN_MESA')
TRANSICIONES = {
    'PENDIENTE': {'CONFIRMADA', 'CANCELADA'},
    'CONFIRMADA': {'EN_MESA', 'CANCELADA', 'NO_ASISTIO'},
    'EN_MESA': {'COMPLETADA'},
    'COMPLETADA': set(),
    'CANCELADA': set(),
    'NO_ASISTIO': set(),
}


def fila(db, tabla, identidad, *, bloquear=False):
    stmt = select(tabla).where(tabla.c.id == identidad)
    if bloquear:
        stmt = stmt.with_for_update()
    encontrado = db.execute(stmt).mappings().first()
    if encontrado is None:
        raise HTTPException(404, 'Recurso no encontrado')
    return dict(encontrado)


def guardar(db, statement):
    try:
        result = db.execute(statement)
        db.commit()
        return result
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, 'Conflicto con restriccion de datos') from exc
    except Exception:
        db.rollback()
        raise


def comprobar_reserva(db, mesa_id, cliente_id, personas, fecha_hora, excluir=None):
    # Serializa la verificacion de disponibilidad por mesa para evitar
    # que dos solicitudes simultaneas creen reservas solapadas.
    mesa = fila(db, mesas, mesa_id, bloquear=True)
    cliente = fila(db, clientes, cliente_id)
    if not mesa['activo'] or mesa['estado'] == 'FUERA_DE_SERVICIO':
        raise HTTPException(409, 'Mesa no disponible')
    if not cliente['activo']:
        raise HTTPException(409, 'Cliente inactivo')
    if personas > mesa['capacidad']:
        raise HTTPException(422, 'Personas superan capacidad de mesa')
    stmt = select(reservas.c.id).where(and_(
        reservas.c.mesa_id == mesa_id,
        reservas.c.estado.in_(ACTIVAS),
        reservas.c.fecha_hora > fecha_hora - VENTANA,
        reservas.c.fecha_hora < fecha_hora + VENTANA,
    ))
    if excluir is not None:
        stmt = stmt.where(reservas.c.id != excluir)
    if db.execute(stmt.limit(1)).first():
        raise HTTPException(409, 'Conflicto de reserva: intervalo inferior a 2 horas')


@router.get('/clientes', response_model=list[ClienteRead])
def listar_clientes(db: Session = Depends(get_db)):
    return db.execute(select(clientes).order_by(clientes.c.id)).mappings().all()


@router.post('/clientes', response_model=ClienteRead, status_code=status.HTTP_201_CREATED)
def crear_cliente(payload: ClienteCreate, db: Session = Depends(get_db)):
    result = guardar(db, insert(clientes).values(**payload.model_dump()).returning(clientes.c.id))
    return fila(db, clientes, result.scalar_one())


@router.get('/clientes/{cliente_id}', response_model=ClienteRead)
def obtener_cliente(cliente_id: int, db: Session = Depends(get_db)):
    return fila(db, clientes, cliente_id)


@router.patch('/clientes/{cliente_id}', response_model=ClienteRead)
def editar_cliente(cliente_id: int, payload: ClienteUpdate, db: Session = Depends(get_db)):
    fila(db, clientes, cliente_id)
    changes = payload.model_dump(exclude_unset=True)
    if any(changes.get(key) is None for key in ('nombre', 'activo') if key in changes):
        raise HTTPException(422, 'Campo obligatorio no puede ser null')
    if changes:
        guardar(db, update(clientes).where(clientes.c.id == cliente_id).values(**changes, updated_at=func.now()))
    return fila(db, clientes, cliente_id)


@router.get('/reservas', response_model=list[ReservaRead])
def listar_reservas(db: Session = Depends(get_db)):
    return db.execute(select(reservas).order_by(reservas.c.fecha_hora)).mappings().all()


@router.post('/reservas', response_model=ReservaRead, status_code=status.HTTP_201_CREATED)
def crear_reserva(payload: ReservaCreate, db: Session = Depends(get_db)):
    try:
        comprobar_reserva(db, payload.mesa_id, payload.cliente_id, payload.personas, payload.fecha_hora)
        result = guardar(db, insert(reservas).values(**payload.model_dump()).returning(reservas.c.id))
        return fila(db, reservas, result.scalar_one())
    except Exception:
        db.rollback()
        raise


@router.get('/reservas/{reserva_id}', response_model=ReservaRead)
def obtener_reserva(reserva_id: int, db: Session = Depends(get_db)):
    return fila(db, reservas, reserva_id)


@router.patch('/reservas/{reserva_id}', response_model=ReservaRead)
def editar_reserva(reserva_id: int, payload: ReservaUpdate, db: Session = Depends(get_db)):
    try:
        actual = fila(db, reservas, reserva_id, bloquear=True)
        if actual['estado'] not in ('PENDIENTE', 'CONFIRMADA'):
            raise HTTPException(409, 'La reserva ya no admite edicion')
        changes = payload.model_dump(exclude_unset=True)
        if any(changes.get(key) is None for key in ('mesa_id', 'cliente_id', 'personas') if key in changes):
            raise HTTPException(422, 'Campo obligatorio no puede ser null')
        values = {key: changes.get(key, actual[key]) for key in ('mesa_id', 'cliente_id', 'personas', 'fecha_hora')}
        # Bloquear mesa tras reserva; evita interbloqueos ordinarios en mismo caso.
        comprobar_reserva(db, **values, excluir=reserva_id)
        if changes:
            guardar(db, update(reservas).where(reservas.c.id == reserva_id).values(**changes, updated_at=func.now()))
        return fila(db, reservas, reserva_id)
    except Exception:
        db.rollback()
        raise


@router.patch('/reservas/{reserva_id}/estado', response_model=ReservaRead)
def cambiar_estado_reserva(reserva_id: int, payload: ReservaEstado, db: Session = Depends(get_db)):
    try:
        actual = fila(db, reservas, reserva_id, bloquear=True)
        if payload.estado not in TRANSICIONES[actual['estado']]:
            raise HTTPException(409, 'Transicion de estado no permitida')
        if payload.estado == 'CONFIRMADA':
            comprobar_reserva(db, actual['mesa_id'], actual['cliente_id'], actual['personas'], actual['fecha_hora'], excluir=reserva_id)
        guardar(db, update(reservas).where(reservas.c.id == reserva_id).values(estado=payload.estado, updated_at=func.now()))
        return fila(db, reservas, reserva_id)
    except Exception:
        db.rollback()
        raise
