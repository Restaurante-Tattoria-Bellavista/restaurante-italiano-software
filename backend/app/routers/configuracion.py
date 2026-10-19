from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)
from sqlalchemy import insert, select, update
from sqlalchemy.exc import (
    IntegrityError,
    SQLAlchemyError,
)
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.configuracion import (
    restaurante_config,
)
from app.schemas.configuracion import (
    RestauranteConfigRead,
    RestauranteConfigUpdate,
)


router = APIRouter(
    prefix="/api/v1/configuracion",
    tags=["Configuración del restaurante"],
)


CONFIGURACION_PREDETERMINADA = {
    "nombre": "Trattoria Bellavista",
    "nit": None,
    "telefono": "3000000000",
    "correo": "contacto@bellavista.com",
    "direccion": "Dirección por configurar",
    "ciudad": "Bogotá",
    "moneda": "COP",
    "zona_horaria": "America/Bogota",
    "porcentaje_servicio": 10,
    "activo": True,
}


def obtener_registro(
    db: Session,
) -> dict | None:
    registro = db.execute(
        select(restaurante_config)
        .where(restaurante_config.c.activo.is_(True))
        .order_by(restaurante_config.c.id)
        .limit(1)
    ).mappings().first()

    if registro is None:
        return None

    return dict(registro)


def guardar_cambios(
    db: Session,
    sentencia,
):
    try:
        resultado = db.execute(sentencia)
        db.commit()

        return resultado
    except IntegrityError as error:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "La configuración contiene datos "
                "que generan un conflicto."
            ),
        ) from error
    except SQLAlchemyError:
        db.rollback()
        raise


def crear_configuracion_inicial(
    db: Session,
) -> dict:
    resultado = guardar_cambios(
        db,
        insert(restaurante_config)
        .values(**CONFIGURACION_PREDETERMINADA)
        .returning(restaurante_config.c.id),
    )

    configuracion_id = resultado.scalar_one()

    registro = db.execute(
        select(restaurante_config).where(
            restaurante_config.c.id
            == configuracion_id
        )
    ).mappings().first()

    if registro is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "No fue posible crear la configuración "
                "inicial del restaurante."
            ),
        )

    return dict(registro)


@router.get(
    "/restaurante",
    response_model=RestauranteConfigRead,
)
def consultar_configuracion(
    db: Session = Depends(get_db),
):
    registro = obtener_registro(db)

    if registro is None:
        registro = crear_configuracion_inicial(db)

    return registro


@router.put(
    "/restaurante",
    response_model=RestauranteConfigRead,
)
def actualizar_configuracion(
    payload: RestauranteConfigUpdate,
    db: Session = Depends(get_db),
):
    registro = obtener_registro(db)
    datos = payload.model_dump()

    if registro is None:
        resultado = guardar_cambios(
            db,
            insert(restaurante_config)
            .values(
                **datos,
                activo=True,
            )
            .returning(restaurante_config.c.id),
        )

        configuracion_id = resultado.scalar_one()
    else:
        configuracion_id = registro["id"]

        guardar_cambios(
            db,
            update(restaurante_config)
            .where(
                restaurante_config.c.id
                == configuracion_id
            )
            .values(
                **datos,
                updated_at=func.now(),
            ),
        )

    configuracion_actualizada = db.execute(
        select(restaurante_config).where(
            restaurante_config.c.id
            == configuracion_id
        )
    ).mappings().first()

    if configuracion_actualizada is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "No fue posible recuperar la configuración "
                "actualizada."
            ),
        )

    return dict(configuracion_actualizada)