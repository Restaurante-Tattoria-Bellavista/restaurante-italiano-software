from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, insert, update, func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.catalogo import mesas, mesa_layout, productos
from app.schemas.catalogo import (
    MesaCreate, MesaUpdate, MesaRead, LayoutUpsert, LayoutRead,
    ProductoCreate, ProductoUpdate, ProductoRead
)

router = APIRouter(prefix="/api/v1", tags=["Mesas, layout y productos"])


def _fetch(session: Session, table, pk: str, identity: int):
    record = session.execute(select(table).where(table.c[pk] == identity)).mappings().first()
    if record is None:
        raise HTTPException(status_code=404, detail="Recurso no encontrado")
    return dict(record)


def _save(session: Session, stmt):
    try:
        result = session.execute(stmt)
        session.commit()
        return result
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="Conflicto con restriccion de datos")
    except SQLAlchemyError:
        session.rollback()
        raise


@router.get("/mesas", response_model=list[MesaRead])
def listar_mesas(db: Session = Depends(get_db)):
    return db.execute(select(mesas).order_by(mesas.c.numero)).mappings().all()


@router.post("/mesas", response_model=MesaRead, status_code=status.HTTP_201_CREATED)
def crear_mesa(payload: MesaCreate, db: Session = Depends(get_db)):
    result = _save(db, insert(mesas).values(**payload.model_dump()).returning(mesas.c.id))
    return _fetch(db, mesas, "id", result.scalar_one())


@router.get("/mesas/{mesa_id}", response_model=MesaRead)
def obtener_mesa(mesa_id: int, db: Session = Depends(get_db)):
    return _fetch(db, mesas, "id", mesa_id)


@router.patch("/mesas/{mesa_id}", response_model=MesaRead)
def editar_mesa(mesa_id: int, payload: MesaUpdate, db: Session = Depends(get_db)):
    _fetch(db, mesas, "id", mesa_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes:
        _save(db, update(mesas).where(mesas.c.id == mesa_id).values(**changes, updated_at=func.now()))
    return _fetch(db, mesas, "id", mesa_id)


@router.get("/mesas/{mesa_id}/layout", response_model=LayoutRead)
def obtener_layout(mesa_id: int, db: Session = Depends(get_db)):
    _fetch(db, mesas, "id", mesa_id)
    return _fetch(db, mesa_layout, "mesa_id", mesa_id)


@router.put("/mesas/{mesa_id}/layout", response_model=LayoutRead)
def guardar_layout(mesa_id: int, payload: LayoutUpsert, db: Session = Depends(get_db)):
    _fetch(db, mesas, "id", mesa_id)
    exists = db.execute(select(mesa_layout.c.mesa_id).where(mesa_layout.c.mesa_id == mesa_id)).scalar_one_or_none()
    values = payload.model_dump()
    if exists is None:
        stmt = insert(mesa_layout).values(mesa_id=mesa_id, **values)
    else:
        stmt = update(mesa_layout).where(mesa_layout.c.mesa_id == mesa_id).values(**values, updated_at=func.now())
    _save(db, stmt)
    return _fetch(db, mesa_layout, "mesa_id", mesa_id)


@router.get("/productos", response_model=list[ProductoRead])
def listar_productos(db: Session = Depends(get_db)):
    return db.execute(select(productos).order_by(productos.c.id)).mappings().all()


@router.post("/productos", response_model=ProductoRead, status_code=status.HTTP_201_CREATED)
def crear_producto(payload: ProductoCreate, db: Session = Depends(get_db)):
    result = _save(db, insert(productos).values(**payload.model_dump()).returning(productos.c.id))
    return _fetch(db, productos, "id", result.scalar_one())


@router.get("/productos/{producto_id}", response_model=ProductoRead)
def obtener_producto(producto_id: int, db: Session = Depends(get_db)):
    return _fetch(db, productos, "id", producto_id)


@router.patch("/productos/{producto_id}", response_model=ProductoRead)
def editar_producto(producto_id: int, payload: ProductoUpdate, db: Session = Depends(get_db)):
    _fetch(db, productos, "id", producto_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes:
        _save(db, update(productos).where(productos.c.id == producto_id).values(**changes, updated_at=func.now()))
    return _fetch(db, productos, "id", producto_id)
