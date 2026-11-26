"""Usuarios del sistema, plantillas faciales y auditoria de accesos."""
from sqlalchemy import Table, Column, Integer, String, Boolean, DateTime, Float, CheckConstraint, ForeignKey, func
from sqlalchemy.dialects.postgresql import ARRAY

from app.models.catalogo import metadata

ROL_ADMIN = "ADMIN"
ROL_PERSONAL = "PERSONAL"
ROLES_VALIDOS = (ROL_ADMIN, ROL_PERSONAL)

usuarios = Table(
    "usuarios", metadata,
    Column("id", Integer, primary_key=True),
    Column("username", String(60), nullable=False, unique=True),
    Column("nombre", String(120), nullable=False),
    Column("rol", String(20), nullable=False),
    Column("password_hash", String(255)),
    Column("activo", Boolean, nullable=False, server_default="true"),
    Column("intentos_fallidos", Integer, nullable=False, server_default="0"),
    Column("bloqueado_hasta", DateTime(timezone=True)),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    CheckConstraint("rol IN ('ADMIN', 'PERSONAL')", name="ck_usuarios_rol"),
)

# Varias plantillas por persona (una por posicion registrada). Cada descriptor tiene 128 valores.
rostro_plantillas = Table(
    "rostro_plantillas", metadata,
    Column("id", Integer, primary_key=True),
    Column("usuario_id", Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False),
    Column("pose", String(20), nullable=False),
    Column("descriptor", ARRAY(Float), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    CheckConstraint("pose IN ('FRENTE', 'IZQUIERDA', 'DERECHA', 'ARRIBA', 'ABAJO')", name="ck_rostro_pose"),
)

auditoria_accesos = Table(
    "auditoria_accesos", metadata,
    Column("id", Integer, primary_key=True),
    Column("usuario_id", Integer),
    Column("username_intento", String(60)),
    Column("metodo", String(20), nullable=False),
    Column("exitoso", Boolean, nullable=False),
    Column("motivo", String(60), nullable=False),
    Column("ip", String(64)),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)

# Cuentas pedidas desde la pantalla de ingreso. Quedan PENDIENTES hasta que un administrador las resuelve.
solicitudes_acceso = Table(
    "solicitudes_acceso", metadata,
    Column("id", Integer, primary_key=True),
    Column("username", String(60), nullable=False),
    Column("nombre", String(120), nullable=False),
    Column("password_hash", String(255), nullable=False),
    Column("estado", String(12), nullable=False, server_default="PENDIENTE"),
    Column("ip", String(64)),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("resuelta_at", DateTime(timezone=True)),
    Column("resuelta_por", String(60)),
    Column("motivo", String(200)),
    CheckConstraint("estado IN ('PENDIENTE', 'APROBADA', 'RECHAZADA')", name="ck_solicitudes_estado"),
)
