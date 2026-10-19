from sqlalchemy import (
    Table, Column, Integer, String, Boolean, Text, Numeric, DateTime,
    ForeignKey, MetaData, CheckConstraint, func
)

metadata = MetaData()
mesas = Table(
    "mesas", metadata,
    Column("id", Integer, primary_key=True),
    Column("numero", Integer, nullable=False, unique=True),
    Column("capacidad", Integer, nullable=False),
    Column("ubicacion", String(100)),
    Column("estado", String(30), nullable=False, server_default="LIBRE"),
    Column("activo", Boolean, nullable=False, server_default="true"),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    CheckConstraint("capacidad > 0", name="ck_mesas_capacidad_positiva"),
    CheckConstraint("estado IN ('LIBRE','OCUPADA','RESERVADA','FUERA_DE_SERVICIO')", name="ck_mesas_estado_valido"),
)
mesa_layout = Table(
    "mesa_layout", metadata,
    Column("mesa_id", Integer, ForeignKey("mesas.id", ondelete="CASCADE"), primary_key=True),
    Column("zona", String(30), nullable=False, server_default="SALON"),
    Column("pos_x", Numeric(5, 2), nullable=False),
    Column("pos_y", Numeric(5, 2), nullable=False),
    Column("forma", String(20), nullable=False, server_default="ROUND"),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    CheckConstraint("pos_x BETWEEN 0 AND 100", name="ck_mesa_layout_pos_x"),
    CheckConstraint("pos_y BETWEEN 0 AND 100", name="ck_mesa_layout_pos_y"),
    CheckConstraint("zona IN ('SALON','TERRAZA','VIP','BAR','OTRA')", name="ck_mesa_layout_zona"),
    CheckConstraint("forma IN ('ROUND','RECT','SMALL')", name="ck_mesa_layout_forma"),
)
productos = Table(
    "productos", metadata,
    Column("id", Integer, primary_key=True),
    Column("nombre", String(150), nullable=False, unique=True),
    Column("descripcion", Text),
    Column("precio", Numeric(12, 2), nullable=False),
    Column("categoria", String(30), nullable=False, server_default="OTRO"),
    Column("disponible", Boolean, nullable=False, server_default="true"),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    CheckConstraint("precio > 0", name="ck_productos_precio_positivo"),
    CheckConstraint("categoria IN ('ENTRADA','PLATO_FUERTE','BEBIDA','POSTRE','OTRO')", name="ck_productos_categoria_valida"),
)
