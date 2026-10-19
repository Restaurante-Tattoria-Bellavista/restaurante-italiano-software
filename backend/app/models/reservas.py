from sqlalchemy import Table, Column, Integer, String, Boolean, Text, DateTime, ForeignKey, MetaData, func
from app.models.catalogo import metadata

clientes = Table(
    'clientes', metadata,
    Column('id', Integer, primary_key=True),
    Column('nombre', String(150), nullable=False),
    Column('telefono', String(30)),
    Column('email', String(150), unique=True),
    Column('observaciones', Text),
    Column('activo', Boolean, nullable=False, server_default='true'),
    Column('created_at', DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column('updated_at', DateTime(timezone=True), nullable=False, server_default=func.now()),
)

reservas = Table(
    'reservas', metadata,
    Column('id', Integer, primary_key=True),
    Column('mesa_id', Integer, ForeignKey('mesas.id', ondelete='RESTRICT'), nullable=False),
    Column('cliente_id', Integer, ForeignKey('clientes.id', ondelete='RESTRICT'), nullable=False),
    Column('fecha_hora', DateTime(timezone=True), nullable=False),
    Column('personas', Integer, nullable=False),
    Column('estado', String(30), nullable=False, server_default='PENDIENTE'),
    Column('observaciones', Text),
    Column('created_at', DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column('updated_at', DateTime(timezone=True), nullable=False, server_default=func.now()),
)
