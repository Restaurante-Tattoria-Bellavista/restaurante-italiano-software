"""Solicitudes de acceso: cualquiera puede pedir una cuenta; un administrador la aprueba o la rechaza.

La contrasena se guarda ya hasheada en la solicitud. Al aprobar se crea el usuario con ese mismo hash;
mientras tanto la persona no puede entrar (no existe como usuario).
"""
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import require_admin
from app.core.rate_limit import limitador_registro
from app.core.security import hash_password
from app.db.session import get_db
from app.models.usuarios import solicitudes_acceso, usuarios
from app.routers.auth import _auditar, _ip, _usuario_read
from app.schemas.auth import (
    AprobarSolicitud,
    RechazarSolicitud,
    SolicitudCreate,
    SolicitudEnviada,
    SolicitudRead,
    UsuarioRead,
)

# Ruta publica: no exige sesion (quien se registra todavia no tiene cuenta).
publico_router = APIRouter(prefix="/api/auth", tags=["Autenticacion"])
# Rutas de administracion: la sesion la exige main.py y el rol, require_admin en cada endpoint.
admin_router = APIRouter(prefix="/api/solicitudes", tags=["Solicitudes de acceso"])

# Tope global de solicitudes sin resolver: evita que alguien llene la base pidiendo cuentas en masa.
MAX_PENDIENTES = 100


@publico_router.post(
    "/registro",
    response_model=SolicitudEnviada,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Solicitar una cuenta (queda pendiente de aprobacion)",
)
def solicitar_acceso(payload: SolicitudCreate, request: Request, db: Session = Depends(get_db)):
    ip = _ip(request)
    clave = ip or "desconocida"
    # Cada solicitud cuenta contra el limite, sea valida o no (5 por hora y por IP).
    limitador_registro.verificar(clave)
    limitador_registro.registrar_fallo(clave)

    if db.execute(select(usuarios.c.id).where(usuarios.c.username == payload.username)).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ese nombre de usuario no está disponible.")
    if db.execute(
        select(solicitudes_acceso.c.id).where(
            solicitudes_acceso.c.username == payload.username, solicitudes_acceso.c.estado == "PENDIENTE"
        )
    ).first() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya hay una solicitud pendiente para ese usuario.")
    pendientes = db.execute(
        select(func.count()).select_from(solicitudes_acceso).where(solicitudes_acceso.c.estado == "PENDIENTE")
    ).scalar_one()
    if pendientes >= MAX_PENDIENTES:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Hay demasiadas solicitudes pendientes. Intenta de nuevo más tarde.",
        )

    try:
        db.execute(
            insert(solicitudes_acceso).values(
                username=payload.username,
                nombre=payload.nombre,
                password_hash=hash_password(payload.password),
                estado="PENDIENTE",
                ip=ip,
            )
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya hay una solicitud pendiente para ese usuario.")

    _auditar(db, usuario_id=None, username=payload.username, metodo="REGISTRO",
             exitoso=True, motivo="SOLICITUD_CREADA", ip=ip)
    return SolicitudEnviada(
        mensaje="Solicitud enviada. Un administrador debe aprobarla antes de que puedas iniciar sesión."
    )


@admin_router.get("", response_model=list[SolicitudRead], summary="Listar solicitudes de acceso (admin)")
def listar_solicitudes(
    estado: Literal["PENDIENTE", "APROBADA", "RECHAZADA", "TODAS"] = "PENDIENTE",
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    consulta = select(solicitudes_acceso)
    if estado != "TODAS":
        consulta = consulta.where(solicitudes_acceso.c.estado == estado)
    consulta = consulta.order_by(solicitudes_acceso.c.created_at.desc(), solicitudes_acceso.c.id.desc()).limit(100)
    return [SolicitudRead(**_publica(f)) for f in db.execute(consulta).mappings().all()]


def _publica(fila) -> dict:
    """Campos de una solicitud sin el hash de la contrasena."""
    return {k: v for k, v in dict(fila).items() if k not in ("password_hash", "ip")}


def _solicitud_pendiente(db: Session, solicitud_id: int):
    fila = db.execute(
        select(solicitudes_acceso).where(solicitudes_acceso.c.id == solicitud_id).with_for_update()
    ).mappings().first()
    if fila is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Solicitud no encontrada.")
    if fila["estado"] != "PENDIENTE":
        raise HTTPException(status.HTTP_409_CONFLICT, f"La solicitud ya fue {fila['estado'].lower()}.")
    return fila


@admin_router.post(
    "/{solicitud_id}/aprobar",
    response_model=UsuarioRead,
    summary="Aprobar una solicitud y crear el usuario (admin)",
)
def aprobar_solicitud(
    solicitud_id: int,
    payload: AprobarSolicitud | None = None,
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rol = payload.rol if payload else "PERSONAL"
    try:
        fila = _solicitud_pendiente(db, solicitud_id)
        nuevo = db.execute(
            insert(usuarios)
            .values(
                username=fila["username"],
                nombre=fila["nombre"],
                rol=rol,
                password_hash=fila["password_hash"],
                activo=True,
            )
            .returning(usuarios)
        ).mappings().one()
        db.execute(
            update(solicitudes_acceso)
            .where(solicitudes_acceso.c.id == solicitud_id)
            .values(
                estado="APROBADA",
                resuelta_at=datetime.now(timezone.utc),
                resuelta_por=admin["username"],
                password_hash="",  # ya no hace falta: la cuenta existe
            )
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un usuario con ese nombre.")
    except HTTPException:
        db.rollback()
        raise

    _auditar(db, usuario_id=nuevo["id"], username=nuevo["username"], metodo="REGISTRO",
             exitoso=True, motivo=f"APROBADA_POR_{admin['username']}"[:60], ip=None)
    return _usuario_read(nuevo, False)


@admin_router.post(
    "/{solicitud_id}/rechazar",
    response_model=SolicitudRead,
    summary="Rechazar una solicitud de acceso (admin)",
)
def rechazar_solicitud(
    solicitud_id: int,
    payload: RechazarSolicitud | None = None,
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        fila = _solicitud_pendiente(db, solicitud_id)
        db.execute(
            update(solicitudes_acceso)
            .where(solicitudes_acceso.c.id == solicitud_id)
            .values(
                estado="RECHAZADA",
                resuelta_at=datetime.now(timezone.utc),
                resuelta_por=admin["username"],
                motivo=(payload.motivo.strip() or None) if payload and payload.motivo else None,
            )
        )
        db.commit()
    except HTTPException:
        db.rollback()
        raise

    _auditar(db, usuario_id=None, username=fila["username"], metodo="REGISTRO",
             exitoso=False, motivo=f"RECHAZADA_POR_{admin['username']}"[:60], ip=None)
    actualizada = db.execute(select(solicitudes_acceso).where(solicitudes_acceso.c.id == solicitud_id)).mappings().one()
    return SolicitudRead(**_publica(actualizada))
