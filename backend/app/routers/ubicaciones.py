import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import delete, func, insert, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.dependencies import get_current_user, require_admin
from app.db.session import get_db
from app.models.ubicaciones import etiquetas_ubicacion, ubicaciones_actuales
from app.models.usuarios import usuarios
from app.schemas.ubicaciones import EtiquetaUpdate, LecturasGateway

router = APIRouter(tags=["Ubicaciones"])

# Calibracion: señal medida con la etiqueta a 1 metro del gateway (mediana de 79 lecturas).
RSSI_A_1M = -54
# Factor del entorno para interiores con paredes y personas (aire libre ~2).
FACTOR_ENTORNO_N = 2.5


def _distancia_aproximada(rssi: int) -> tuple[float, str]:
    """Estimacion en metros con el modelo de perdida logaritmica. Es orientativa: el error puede ser grande."""
    metros = round(10 ** ((RSSI_A_1M - rssi) / (10 * FACTOR_ENTORNO_N)), 1)
    if metros < 2:
        banda = "Muy cerca"
    elif metros < 5:
        banda = "Cerca"
    else:
        banda = "Lejos"
    return metros, banda


def _verificar_gateway(token: str | None) -> None:
    esperado = get_settings().gateway_token
    if not esperado:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Gateway no configurado en el servidor.")
    if not token or not hmac.compare_digest(token, esperado):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token de gateway inválido.")


@router.post("/api/ubicaciones/lecturas", status_code=status.HTTP_202_ACCEPTED, summary="Lecturas BLE de un gateway de zona")
def recibir_lecturas(
    payload: LecturasGateway,
    x_gateway_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    _verificar_gateway(x_gateway_token)

    procesadas = 0
    for lectura in payload.lecturas:
        fila = db.execute(
            select(etiquetas_ubicacion.c.usuario_id).where(etiquetas_ubicacion.c.etiqueta_id == lectura.etiqueta)
        ).first()
        if fila is None:
            continue
        db.execute(
            pg_insert(ubicaciones_actuales)
            .values(usuario_id=fila[0], zona=payload.zona, rssi=lectura.rssi)
            .on_conflict_do_update(
                index_elements=[ubicaciones_actuales.c.usuario_id],
                set_={"zona": payload.zona, "rssi": lectura.rssi, "actualizado_at": func.now()},
            )
        )
        procesadas += 1
    db.commit()
    return {"procesadas": procesadas}


@router.get("/api/ubicaciones", summary="Personal con su etiqueta y zona actual")
def listar_ubicaciones(_: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    filas = db.execute(
        select(
            usuarios.c.id,
            usuarios.c.nombre,
            usuarios.c.rol,
            etiquetas_ubicacion.c.etiqueta_id,
            ubicaciones_actuales.c.zona,
            ubicaciones_actuales.c.rssi,
            ubicaciones_actuales.c.actualizado_at,
        )
        .select_from(usuarios)
        .outerjoin(etiquetas_ubicacion, etiquetas_ubicacion.c.usuario_id == usuarios.c.id)
        .outerjoin(ubicaciones_actuales, ubicaciones_actuales.c.usuario_id == usuarios.c.id)
        .where(usuarios.c.activo.is_(True))
        .order_by(usuarios.c.nombre)
    ).mappings().all()
    from datetime import datetime, timezone

    ahora = datetime.now(timezone.utc)
    resultado = []
    for fila in filas:
        registro = dict(fila)
        # La antigüedad se calcula con el reloj del servidor, no con el del navegador.
        if registro["actualizado_at"] is not None:
            registro["segundos_desde"] = int((ahora - registro["actualizado_at"]).total_seconds())
        else:
            registro["segundos_desde"] = None
        if registro["rssi"] is not None:
            metros, banda = _distancia_aproximada(registro["rssi"])
            registro["distancia_m"] = metros
            registro["banda"] = banda
        else:
            registro["distancia_m"] = None
            registro["banda"] = None
        resultado.append(registro)
    return resultado


@router.put(
    "/api/usuarios/{usuario_id}/etiqueta",
    summary="Asignar o quitar la etiqueta BLE de un usuario (admin)",
)
def asignar_etiqueta(
    usuario_id: int,
    payload: EtiquetaUpdate,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    existe = db.execute(select(usuarios.c.id).where(usuarios.c.id == usuario_id)).first()
    if existe is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado.")

    db.execute(delete(etiquetas_ubicacion).where(etiquetas_ubicacion.c.usuario_id == usuario_id))
    if payload.etiqueta:
        try:
            db.execute(insert(etiquetas_ubicacion).values(etiqueta_id=payload.etiqueta, usuario_id=usuario_id))
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT, "Esa etiqueta ya está asignada a otro usuario.")
    else:
        db.commit()
    return {"usuario_id": usuario_id, "etiqueta": payload.etiqueta}
