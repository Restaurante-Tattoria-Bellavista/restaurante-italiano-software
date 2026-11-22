from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import decode_token
from app.db.session import get_db
from app.models.usuarios import ROL_ADMIN, usuarios

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credenciales: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> dict:
    no_autenticado = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Debes iniciar sesion para continuar.",
    )
    if credenciales is None:
        raise no_autenticado

    claims = decode_token(credenciales.credentials, get_settings().auth_secret)
    if claims is None:
        raise no_autenticado

    usuario = db.execute(
        select(usuarios).where(usuarios.c.id == int(claims["sub"]))
    ).mappings().first()
    if usuario is None or not usuario["activo"]:
        raise no_autenticado
    return dict(usuario)


def require_admin(usuario: dict = Depends(get_current_user)) -> dict:
    if usuario["rol"] != ROL_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta accion requiere rol de administrador.",
        )
    return usuario
