from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, insert, update, delete, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.catalogo import mesas, productos
from app.models.operacion import pedidos, detalle_pedido, restaurante_config
from app.schemas.operacion import (PedidoCreate, PedidoEstado, PedidoRead, DetalleCreate,
    DetalleUpdate, DetalleRead, ConfigRead, ConfigUpdate)

router = APIRouter(prefix='/api/v1', tags=['Pedidos, cocina, reportes y configuracion'])
ACTIVOS = ('ABIERTO','EN_PREPARACION','LISTO','ENTREGADO')
TRANSICIONES = {
    'ABIERTO': {'EN_PREPARACION','CANCELADO'},
    'EN_PREPARACION': {'LISTO','CANCELADO'},
    'LISTO': {'ENTREGADO'},
    'ENTREGADO': {'PAGADO'},
    'PAGADO': set(), 'CANCELADO': set()
}

def _get(db, table, pk, value, lock=False):
    stmt = select(table).where(table.c[pk] == value)
    if lock:
        stmt = stmt.with_for_update()
    obj = db.execute(stmt).mappings().first()
    if obj is None:
        raise HTTPException(404,'Recurso no encontrado')
    return dict(obj)

def _commit(db):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409,'Conflicto de integridad')

def _recalcular(db, pedido_id):
    total = db.execute(select(func.coalesce(func.sum(detalle_pedido.c.subtotal),0)).where(
        detalle_pedido.c.pedido_id == pedido_id)).scalar_one()
    db.execute(update(pedidos).where(pedidos.c.id == pedido_id).values(total=total,updated_at=func.now()))

def _pedido_editable(db,pedido_id):
    obj = _get(db,pedidos,'id',pedido_id,True)
    if obj['estado'] != 'ABIERTO':
        raise HTTPException(409,'Solo se modifican detalles de pedidos ABIERTOS')
    return obj

@router.get('/pedidos', response_model=list[PedidoRead])
def listar_pedidos(db: Session = Depends(get_db)):
    return db.execute(select(pedidos).order_by(pedidos.c.id)).mappings().all()

@router.post('/pedidos', response_model=PedidoRead, status_code=status.HTTP_201_CREATED)
def crear_pedido(payload: PedidoCreate, db: Session = Depends(get_db)):
    try:
        mesa = _get(db,mesas,'id',payload.mesa_id,True)
        if not mesa['activo'] or mesa['estado'] != 'LIBRE':
            raise HTTPException(409,'Mesa no disponible')
        activo = db.execute(select(pedidos.c.id).where(pedidos.c.mesa_id == payload.mesa_id,
            pedidos.c.estado.in_(ACTIVOS))).scalar_one_or_none()
        if activo is not None:
            raise HTTPException(409,'Mesa con pedido activo')
        pid = db.execute(insert(pedidos).values(mesa_id=payload.mesa_id).returning(pedidos.c.id)).scalar_one()
        db.execute(update(mesas).where(mesas.c.id == payload.mesa_id).values(estado='OCUPADA',updated_at=func.now()))
        _commit(db)
        return _get(db,pedidos,'id',pid)
    except Exception:
        db.rollback()
        raise

@router.get('/pedidos/{pedido_id}',response_model=PedidoRead)
def obtener_pedido(pedido_id:int, db: Session = Depends(get_db)):
    return _get(db,pedidos,'id',pedido_id)

@router.get('/pedidos/{pedido_id}/detalles',response_model=list[DetalleRead])
def listar_detalles(pedido_id:int, db: Session = Depends(get_db)):
    _get(db,pedidos,'id',pedido_id)
    return db.execute(select(detalle_pedido).where(detalle_pedido.c.pedido_id == pedido_id).order_by(detalle_pedido.c.id)).mappings().all()

@router.post('/pedidos/{pedido_id}/detalles',response_model=DetalleRead,status_code=201)
def agregar_detalle(pedido_id:int, payload:DetalleCreate, db: Session = Depends(get_db)):
    try:
        _pedido_editable(db,pedido_id)
        producto = _get(db,productos,'id',payload.producto_id)
        if not producto['disponible']:
            raise HTTPException(409,'Producto no disponible')
        if db.execute(select(detalle_pedido.c.id).where(detalle_pedido.c.pedido_id == pedido_id,
                detalle_pedido.c.producto_id == payload.producto_id)).first():
            raise HTTPException(409,'Producto duplicado en el pedido; actualice la cantidad')
        precio = producto['precio']
        did = db.execute(insert(detalle_pedido).values(pedido_id=pedido_id,producto_id=payload.producto_id,
            cantidad=payload.cantidad,precio_unitario=precio,subtotal=precio*payload.cantidad,
            observacion=payload.observacion).returning(detalle_pedido.c.id)).scalar_one()
        _recalcular(db,pedido_id)
        _commit(db)
        return _get(db,detalle_pedido,'id',did)
    except Exception:
        db.rollback()
        raise

@router.patch('/pedidos/{pedido_id}/detalles/{detalle_id}',response_model=DetalleRead)
def editar_detalle(pedido_id:int,detalle_id:int,payload:DetalleUpdate,db:Session=Depends(get_db)):
    try:
        _pedido_editable(db,pedido_id)
        detalle = _get(db,detalle_pedido,'id',detalle_id,True)
        if detalle['pedido_id'] != pedido_id:
            raise HTTPException(404,'Detalle no pertenece al pedido')
        db.execute(update(detalle_pedido).where(detalle_pedido.c.id==detalle_id).values(
            cantidad=payload.cantidad,observacion=payload.observacion,
            subtotal=detalle['precio_unitario']*payload.cantidad,updated_at=func.now()))
        _recalcular(db,pedido_id)
        _commit(db)
        return _get(db,detalle_pedido,'id',detalle_id)
    except Exception:
        db.rollback()
        raise

@router.delete('/pedidos/{pedido_id}/detalles/{detalle_id}',status_code=204)
def retirar_detalle(pedido_id:int,detalle_id:int,db:Session=Depends(get_db)):
    try:
        _pedido_editable(db,pedido_id)
        detalle = _get(db,detalle_pedido,'id',detalle_id,True)
        if detalle['pedido_id']!=pedido_id:
            raise HTTPException(404,'Detalle no pertenece al pedido')
        db.execute(delete(detalle_pedido).where(detalle_pedido.c.id == detalle_id))
        _recalcular(db,pedido_id)
        _commit(db)
    except Exception:
        db.rollback()
        raise

@router.patch('/pedidos/{pedido_id}/estado',response_model=PedidoRead)
def cambiar_estado(pedido_id:int,payload:PedidoEstado,db:Session=Depends(get_db)):
    try:
        pedido = _get(db,pedidos,'id',pedido_id,True)
        nuevo = payload.estado
        if nuevo not in TRANSICIONES[pedido['estado']]:
            raise HTTPException(409,'Transicion de estado no permitida')
        if nuevo == 'EN_PREPARACION' and db.execute(select(func.count()).select_from(detalle_pedido).where(
                detalle_pedido.c.pedido_id==pedido_id)).scalar_one() == 0:
            raise HTTPException(409,'Pedido sin productos')
        values = {'estado':nuevo,'updated_at':func.now()}
        if nuevo in ('PAGADO','CANCELADO'):
            values['closed_at'] = func.now()
            # Lock mesa before determining if it can be released.
            _get(db,mesas,'id',pedido['mesa_id'],True)
            otros = db.execute(select(pedidos.c.id).where(pedidos.c.mesa_id == pedido['mesa_id'],
                pedidos.c.id != pedido_id,pedidos.c.estado.in_(ACTIVOS))).first()
            if not otros:
                db.execute(update(mesas).where(mesas.c.id == pedido['mesa_id']).values(
                    estado='LIBRE',updated_at=func.now()))
        db.execute(update(pedidos).where(pedidos.c.id==pedido_id).values(**values))
        _commit(db)
        return _get(db,pedidos,'id',pedido_id)
    except Exception:
        db.rollback()
        raise

@router.get('/cocina')
def cocina(db:Session=Depends(get_db)):
    return [dict(r) for r in db.execute(select(pedidos).where(pedidos.c.estado.in_(
        ('EN_PREPARACION','LISTO'))).order_by(pedidos.c.created_at)).mappings().all()]

@router.get('/reportes/dashboard')
def dashboard(db:Session=Depends(get_db)):
    counts = db.execute(select(pedidos.c.estado,func.count().label('cantidad')).group_by(pedidos.c.estado)).all()
    facturacion = db.execute(select(func.coalesce(func.sum(pedidos.c.total),0)).where(pedidos.c.estado=='PAGADO')).scalar_one()
    return {'pedidos_por_estado':{k:v for k,v in counts},'ventas_pagadas':str(facturacion)}

@router.get('/reportes/productos')
def ranking_productos(db:Session=Depends(get_db)):
    stmt = select(productos.c.id,productos.c.nombre,func.sum(detalle_pedido.c.cantidad).label('unidades')).select_from(
        detalle_pedido.join(productos,detalle_pedido.c.producto_id==productos.c.id).join(
            pedidos,detalle_pedido.c.pedido_id==pedidos.c.id)).where(
            pedidos.c.estado=='PAGADO').group_by(productos.c.id,productos.c.nombre).order_by(
            func.sum(detalle_pedido.c.cantidad).desc())
    return [dict(r) for r in db.execute(stmt).mappings().all()]

@router.get('/configuracion',response_model=ConfigRead)
def ver_configuracion(db:Session=Depends(get_db)):
    result = db.execute(select(restaurante_config).order_by(restaurante_config.c.id)).mappings().first()
    if not result:
        return {'id':0,'nombre':'Trattoria Bellavista','especialidad':'Cucina Italiana','moneda':'COP'}
    return dict(result)

@router.patch('/configuracion',response_model=ConfigRead)
def editar_configuracion(payload:ConfigUpdate,db:Session=Depends(get_db)):
    changes = payload.model_dump(exclude_unset=True)
    mandatory = {'nombre','especialidad','moneda'}
    if any(k in changes and changes[k] is None for k in mandatory):
        raise HTTPException(422,'Campo obligatorio no puede ser nulo')
    try:
        row = db.execute(select(restaurante_config.c.id).order_by(restaurante_config.c.id).limit(1).with_for_update()).scalar_one_or_none()
        if row is None:
            row = db.execute(insert(restaurante_config).values(**changes).returning(restaurante_config.c.id)).scalar_one()
        elif changes:
            db.execute(update(restaurante_config).where(restaurante_config.c.id==row).values(**changes,updated_at=func.now()))
        _commit(db)
        return dict(_get(db,restaurante_config,'id',row))
    except Exception:
        db.rollback()
        raise
