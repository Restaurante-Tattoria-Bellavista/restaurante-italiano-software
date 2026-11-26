import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, desc, func, insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.dependencies import get_current_user, require_admin
from app.core.metricas import registrar_ingreso_facial
from app.core.rate_limit import limitador_face_login, limitador_login, limitador_retos_faciales
from app.core.retos_faciales import retos_faciales
from app.core.security import HASH_FICTICIO, create_token, hash_password, verify_password
from app.db.session import get_db
from app.models.usuarios import auditoria_accesos, rostro_plantillas, solicitudes_acceso, usuarios
from app.schemas.auth import (
    FaceChallengeRead,
    FaceLoginRequest,
    LoginRequest,
    RostroUpdate,
    SesionRead,
    UsuarioCreate,
    UsuarioRead,
)
from app.services.auth_service import (
    DescriptorInvalido,
    hay_variacion_suficiente,
    identificar_con_capturas,
    rostro_ya_registrado,
    validar_coherencia_registro,
    validar_descriptor,
    validar_plantillas,
    verificar_poses_del_reto,
)

router = APIRouter(prefix="/api/auth", tags=["Autenticacion"])
usuarios_router = APIRouter(prefix="/api/usuarios", tags=["Usuarios"])

_CREDENCIALES_INVALIDAS = "Usuario o contrasena incorrectos."
_ROSTRO_NO_RECONOCIDO = "No fue posible reconocer el rostro."
_CUENTA_BLOQUEADA = "Cuenta bloqueada temporalmente por demasiados intentos fallidos."
_SOLICITUD_PENDIENTE = "Tu solicitud de acceso está pendiente de aprobación por un administrador."
_SOLICITUD_RECHAZADA = "Tu solicitud de acceso fue rechazada. Comunícate con un administrador."
_RETO_INVALIDO = "El reto de verificación venció o no es válido. Vuelve a intentarlo."

MAX_INTENTOS_CLAVE = 5
MINUTOS_BLOQUEO = 15


def _ids_con_rostro(db: Session) -> set[int]:
    return set(db.execute(select(rostro_plantillas.c.usuario_id).distinct()).scalars().all())


def _cargar_plantillas(db: Session, *, excluir_usuario: int | None = None) -> dict[int, list]:
    """Plantillas de los usuarios activos que tienen rostro registrado, agrupadas por usuario."""
    consulta = (
        select(rostro_plantillas.c.usuario_id, rostro_plantillas.c.descriptor)
        .join(usuarios, usuarios.c.id == rostro_plantillas.c.usuario_id)
        .where(usuarios.c.activo.is_(True))
    )
    if excluir_usuario is not None:
        consulta = consulta.where(rostro_plantillas.c.usuario_id != excluir_usuario)
    plantillas: dict[int, list] = {}
    for usuario_id, plantilla in db.execute(consulta).all():
        plantillas.setdefault(usuario_id, []).append(plantilla)
    return plantillas


def _estado_solicitud(db: Session, username: str, password: str) -> str | None:
    """PENDIENTE o RECHAZADA si hay una solicitud de ese usuario y la contrasena coincide; si no, None.

    Exigir la contrasena evita que cualquiera averigue si un nombre tiene una solicitud en curso.
    """
    fila = db.execute(
        select(solicitudes_acceso.c.estado, solicitudes_acceso.c.password_hash)
        .where(solicitudes_acceso.c.username == username, solicitudes_acceso.c.estado.in_(("PENDIENTE", "RECHAZADA")))
        .order_by(solicitudes_acceso.c.id.desc())
        .limit(1)
    ).first()
    if fila is None or not verify_password(password, fila.password_hash):
        return None
    return fila.estado


def _bloqueada(row, ahora: datetime) -> bool:
    hasta = row["bloqueado_hasta"]
    if hasta is None:
        return False
    if hasta.tzinfo is None:  # algunos motores devuelven fechas sin zona; se asumen UTC
        hasta = hasta.replace(tzinfo=timezone.utc)
    return hasta > ahora


def _registrar_fallo_facial_usuario(db: Session, row, ahora: datetime) -> None:
    """Suma un fallo de rostro a la cuenta (mismo contador y bloqueo que la contrasena)."""
    intentos = row["intentos_fallidos"] + 1
    valores = {"intentos_fallidos": intentos}
    if intentos >= MAX_INTENTOS_CLAVE:
        valores = {"intentos_fallidos": 0, "bloqueado_hasta": ahora + timedelta(minutes=MINUTOS_BLOQUEO)}
    db.execute(update(usuarios).where(usuarios.c.id == row["id"]).values(**valores))


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
        if row is None:
            estado = _estado_solicitud(db, username, payload.password)
            if estado is not None:
                _auditar(db, usuario_id=None, username=username, metodo="PASSWORD",
                         exitoso=False, motivo=f"SOLICITUD_{estado}", ip=ip)
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    _SOLICITUD_PENDIENTE if estado == "PENDIENTE" else _SOLICITUD_RECHAZADA,
                )
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


@router.post("/face-challenge", response_model=FaceChallengeRead, summary="Pide un reto de un solo uso para el ingreso facial")
def reto_facial(request: Request):
    """El servidor elige las poses que la persona debe hacer. El reto vence rapido y solo sirve una vez."""
    ip = _ip(request) or "desconocida"
    limitador_retos_faciales.verificar(ip)
    limitador_retos_faciales.registrar_fallo(ip)
    reto_id, poses, vigencia = retos_faciales.emitir(ip)
    return FaceChallengeRead(challenge_id=reto_id, poses=list(poses), expira_en=vigencia)


@router.post("/face-login", response_model=SesionRead, summary="Ingreso con reconocimiento facial (reto + varias capturas)")
def face_login(payload: FaceLoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = _ip(request)
    clave_ip = ip or "desconocida"
    cfg = get_settings()
    limitador_face_login.verificar(clave_ip)
    ahora = datetime.now(timezone.utc)
    username = payload.username.strip().lower() if payload.username else None

    def rechazar(motivo: str, codigo: int = status.HTTP_401_UNAUTHORIZED, mensaje: str = _ROSTRO_NO_RECONOCIDO,
                 usuario_id=None, distancia: float | None = None):
        detalle = f"{motivo} d={distancia:.2f}" if distancia is not None else motivo
        _auditar(db, usuario_id=usuario_id, username=username, metodo="ROSTRO",
                 exitoso=False, motivo=detalle[:60], ip=ip)
        limitador_face_login.registrar_fallo(clave_ip)
        raise HTTPException(codigo, mensaje)

    # 1. El reto debe existir, no haberse usado y ser de esta misma IP.
    poses = retos_faciales.consumir(payload.challenge_id, clave_ip)
    if poses is None:
        rechazar("RETO_INVALIDO", status.HTTP_400_BAD_REQUEST, _RETO_INVALIDO)

    # 2. Las capturas deben ser exactamente las poses pedidas, en orden, y distintas entre si.
    try:
        descriptores = verificar_poses_del_reto(poses, [(c.pose, c.descriptor) for c in payload.capturas])
    except DescriptorInvalido:
        rechazar("RETO_INCORRECTO", status.HTTP_422_UNPROCESSABLE_ENTITY, "Las capturas no corresponden al reto.")
    if not hay_variacion_suficiente(descriptores, cfg.face_variacion_minima):
        rechazar("CAPTURAS_SIN_VARIACION")

    # 3. Identificacion: 1:1 si viene usuario, 1:N si no.
    fila_usuario = None
    solo_usuario = None
    if username:
        fila_usuario = db.execute(select(usuarios).where(usuarios.c.username == username)).mappings().first()
        solo_usuario = fila_usuario["id"] if fila_usuario is not None and fila_usuario["activo"] else -1
        if fila_usuario is not None and _bloqueada(fila_usuario, ahora):
            rechazar("CUENTA_BLOQUEADA", status.HTTP_423_LOCKED, _CUENTA_BLOQUEADA, usuario_id=fila_usuario["id"])

    inicio = time.perf_counter()
    usuario_id, distancia = identificar_con_capturas(
        descriptores,
        _cargar_plantillas(db),
        umbral=cfg.face_umbral_1a1 if username else cfg.face_umbral,
        solo_usuario=solo_usuario,
    )
    registrar_ingreso_facial(time.perf_counter() - inicio, usuario_id is not None)

    if usuario_id is None:
        if fila_usuario is not None and fila_usuario["activo"]:
            _registrar_fallo_facial_usuario(db, fila_usuario, ahora)
        rechazar("ROSTRO_NO_RECONOCIDO", usuario_id=fila_usuario["id"] if fila_usuario is not None else None, distancia=distancia)

    row = db.execute(select(usuarios).where(usuarios.c.id == usuario_id)).mappings().one()
    if _bloqueada(row, ahora):
        rechazar("CUENTA_BLOQUEADA", status.HTTP_423_LOCKED, _CUENTA_BLOQUEADA, usuario_id=row["id"], distancia=distancia)

    db.execute(update(usuarios).where(usuarios.c.id == usuario_id).values(intentos_fallidos=0, bloqueado_hasta=None))
    _auditar(db, usuario_id=row["id"], username=row["username"], metodo="ROSTRO",
             exitoso=True, motivo=f"OK d={distancia:.2f}"[:60], ip=ip)
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
        validar_coherencia_registro(plantillas)
    except DescriptorInvalido as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))

    # Un mismo rostro no puede estar en dos cuentas: evitaria saber quien entra realmente.
    if rostro_ya_registrado([d for _, d in plantillas], _cargar_plantillas(db, excluir_usuario=usuario_id)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Este rostro ya está registrado para otro usuario.")

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
