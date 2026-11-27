import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, desc, func, insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.dependencies import get_current_user, require_admin
from app.core.metricas import registrar_ingreso_facial
from app.core.rate_limit import limitador_face_login, limitador_login
from app.core.security import HASH_FICTICIO, create_token, hash_password, verify_password
from app.db.session import get_db
from app.models.usuarios import auditoria_accesos, rostro_plantillas, usuarios
from app.schemas.auth import (
    FaceLoginRequest,
    LoginRequest,
    RostroUpdate,
    SesionRead,
    UsuarioCreate,
    UsuarioRead,
)
from app.services.auth_service import (
    DescriptorInvalido,
    buscar_usuario,
    validar_descriptor,
    validar_plantillas,
)

router = APIRouter(prefix="/api/auth", tags=["Autenticacion"])
usuarios_router = APIRouter(prefix="/api/usuarios", tags=["Usuarios"])

_CREDENCIALES_INVALIDAS = "Usuario o contrasena incorrectos."
_ROSTRO_NO_RECONOCIDO = "No fue posible reconocer el rostro."
_CUENTA_BLOQUEADA = "Cuenta bloqueada temporalmente por demasiados intentos fallidos."

MAX_INTENTOS_CLAVE = 5
MINUTOS_BLOQUEO = 15


def _ids_con_rostro(db: Session) -> set[int]:
    return set(db.execute(select(rostro_plantillas.c.usuario_id).distinct()).scalars().all())


def _usuario_read(row, tiene_rostro: bool) -> UsuarioRead:
    return UsuarioRead(
        id=row["id"],
        username=row["username"],
        nombre=row["nombre"],
        rol=row["rol"],
        activo=row["activo"],
        tiene_rostro=tiene_rostro,
    )


def _sesion(row, db: Session) -> SesionRead:
    settings = get_settings()
    token = create_token(row["id"], row["rol"], settings.auth_secret, settings.auth_token_ttl_seconds)
    tiene = row["id"] in _ids_con_rostro(db)
    return SesionRead(token=token, usuario=_usuario_read(row, tiene))


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _auditar(db: Session, *, usuario_id, username, metodo, exitoso, motivo, ip) -> None:
    db.execute(insert(auditoria_accesos).values(
        usuario_id=usuario_id,
        username_intento=(username or "")[:60] or None,
        metodo=metodo,
        exitoso=exitoso,
        motivo=motivo,
        ip=ip,
    ))
    db.commit()


@router.post("/login", response_model=SesionRead, summary="Ingreso con usuario y contrasena")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = _ip(request)
    limitador_login.verificar(ip or "desconocida")

    username = payload.username.strip().lower()
    row = db.execute(select(usuarios).where(usuarios.c.username == username)).mappings().first()
    ahora = datetime.now(timezone.utc)

    if row is not None and row["bloqueado_hasta"] is not None and row["bloqueado_hasta"] > ahora:
        _auditar(db, usuario_id=row["id"], username=username, metodo="PASSWORD",
                 exitoso=False, motivo="CUENTA_BLOQUEADA", ip=ip)
        raise HTTPException(status.HTTP_423_LOCKED, _CUENTA_BLOQUEADA)

    # Se verifica siempre una contrasena para que el tiempo de respuesta no revele si el usuario existe.
    hash_guardado = row["password_hash"] if row is not None else None
    clave_valida = verify_password(payload.password, hash_guardado or HASH_FICTICIO)

    if row is None or not row["activo"] or hash_guardado is None or not clave_valida:
        if row is not None and row["activo"] and hash_guardado is not None:
            intentos = row["intentos_fallidos"] + 1
            valores = {"intentos_fallidos": intentos}
            if intentos >= MAX_INTENTOS_CLAVE:
                valores = {
                    "intentos_fallidos": 0,
                    "bloqueado_hasta": ahora + timedelta(minutes=MINUTOS_BLOQUEO),
                }
            db.execute(update(usuarios).where(usuarios.c.id == row["id"]).values(**valores))
        _auditar(db, usuario_id=row["id"] if row is not None else None, username=username,
                 metodo="PASSWORD", exitoso=False, motivo="CREDENCIALES_INVALIDAS", ip=ip)
        limitador_login.registrar_fallo(ip or "desconocida")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, _CREDENCIALES_INVALIDAS)

    db.execute(update(usuarios).where(usuarios.c.id == row["id"]).values(
        intentos_fallidos=0, bloqueado_hasta=None,
    ))
    _auditar(db, usuario_id=row["id"], username=username, metodo="PASSWORD",
             exitoso=True, motivo="OK", ip=ip)
    return _sesion(row, db)


@router.post("/face-login", response_model=SesionRead, summary="Ingreso con reconocimiento facial")
def face_login(payload: FaceLoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = _ip(request)
    limitador_face_login.verificar(ip or "desconocida")

    try:
        descriptor = validar_descriptor(payload.descriptor)
    except DescriptorInvalido as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))

    filas = db.execute(
        select(rostro_plantillas.c.usuario_id, rostro_plantillas.c.descriptor)
        .join(usuarios, usuarios.c.id == rostro_plantillas.c.usuario_id)
        .where(usuarios.c.activo.is_(True))
    ).all()
    plantillas_por_usuario: dict[int, list] = {}
    for usuario_id, plantilla in filas:
        plantillas_por_usuario.setdefault(usuario_id, []).append(plantilla)

    inicio = time.perf_counter()
    usuario_id = buscar_usuario(descriptor, plantillas_por_usuario)
    registrar_ingreso_facial(time.perf_counter() - inicio, usuario_id is not None)
    if usuario_id is None:
        _auditar(db, usuario_id=None, username=None, metodo="ROSTRO",
                 exitoso=False, motivo="ROSTRO_NO_RECONOCIDO", ip=ip)
        limitador_face_login.registrar_fallo(ip or "desconocida")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, _ROSTRO_NO_RECONOCIDO)

    row = db.execute(select(usuarios).where(usuarios.c.id == usuario_id)).mappings().one()
    _auditar(db, usuario_id=row["id"], username=row["username"], metodo="ROSTRO",
             exitoso=True, motivo="OK", ip=ip)
    return _sesion(row, db)


@router.get("/me", response_model=UsuarioRead, summary="Usuario de la sesion actual")
def me(usuario: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    return _usuario_read(usuario, usuario["id"] in _ids_con_rostro(db))


@usuarios_router.get("", response_model=list[UsuarioRead], summary="Listar usuarios (admin)")
def listar_usuarios(_: dict = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.execute(select(usuarios).order_by(usuarios.c.id)).mappings().all()
    con_rostro = _ids_con_rostro(db)
    return [_usuario_read(row, row["id"] in con_rostro) for row in rows]


@usuarios_router.get("/auditoria", summary="Ultimos intentos de acceso (admin)")
def listar_auditoria(
    limite: int = 100,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    limite = max(1, min(limite, 500))
    rows = db.execute(
        select(auditoria_accesos).order_by(desc(auditoria_accesos.c.created_at)).limit(limite)
    ).mappings().all()
    return [dict(row) for row in rows]


@usuarios_router.post(
    "",
    response_model=UsuarioRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear usuario (admin)",
)
def crear_usuario(payload: UsuarioCreate, _: dict = Depends(require_admin), db: Session = Depends(get_db)):
    try:
        resultado = db.execute(
            insert(usuarios)
            .values(
                username=payload.username,
                nombre=payload.nombre.strip(),
                rol=payload.rol,
                password_hash=hash_password(payload.password),
                activo=True,
            )
            .returning(usuarios)
        ).mappings().one()
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un usuario con ese nombre.")
    return _usuario_read(resultado, False)


@usuarios_router.put(
    "/{usuario_id}/rostro",
    response_model=UsuarioRead,
    summary="Registrar o reemplazar el rostro de un usuario con 3 a 5 posiciones (admin)",
)
def registrar_rostro(
    usuario_id: int,
    payload: RostroUpdate,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    existe = db.execute(select(usuarios.c.id).where(usuarios.c.id == usuario_id)).first()
    if existe is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado.")

    try:
        plantillas = validar_plantillas(
            [(p.pose, validar_descriptor(p.descriptor)) for p in payload.plantillas]
        )
    except DescriptorInvalido as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))

    # Reemplazo atomico: si algo falla, se conservan las plantillas anteriores.
    db.execute(delete(rostro_plantillas).where(rostro_plantillas.c.usuario_id == usuario_id))
    for pose, descriptor in plantillas:
        db.execute(insert(rostro_plantillas).values(usuario_id=usuario_id, pose=pose, descriptor=descriptor))
    db.execute(update(usuarios).where(usuarios.c.id == usuario_id).values(updated_at=func.now()))
    db.commit()

    row = db.execute(select(usuarios).where(usuarios.c.id == usuario_id)).mappings().one()
    return _usuario_read(row, True)


@usuarios_router.delete(
    "/{usuario_id}/rostro",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar el rostro registrado de un usuario (admin)",
)
def eliminar_rostro(usuario_id: int, _: dict = Depends(require_admin), db: Session = Depends(get_db)):
    existe = db.execute(select(usuarios.c.id).where(usuarios.c.id == usuario_id)).first()
    if existe is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado.")
    db.execute(delete(rostro_plantillas).where(rostro_plantillas.c.usuario_id == usuario_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
