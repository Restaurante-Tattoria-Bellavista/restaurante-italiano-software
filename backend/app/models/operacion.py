from sqlalchemy import Table, Column, Integer, String, Numeric, DateTime, ForeignKey, Text, MetaData, func
from app.models.catalogo import metadata

pedidos = Table('pedidos', metadata,
    Column('id', Integer, primary_key=True), Column('mesa_id', Integer, ForeignKey('mesas.id'), nullable=False),
    Column('estado', String(30), nullable=False, server_default='ABIERTO'),
    Column('total', Numeric(12,2), nullable=False, server_default='0'),
    Column('created_at', DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column('updated_at', DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column('closed_at', DateTime(timezone=True)))

detalle_pedido = Table('detalle_pedido', metadata,
    Column('id', Integer, primary_key=True), Column('pedido_id', Integer, ForeignKey('pedidos.id',ondelete='CASCADE'),nullable=False),
    Column('producto_id', Integer, ForeignKey('productos.id'), nullable=False),
    Column('cantidad', Integer, nullable=False), Column('precio_unitario', Numeric(12,2), nullable=False),
    Column('subtotal', Numeric(12,2), nullable=False), Column('observacion', String(250)),
    Column('created_at', DateTime(timezone=True),nullable=False,server_default=func.now()),
    Column('updated_at', DateTime(timezone=True),nullable=False,server_default=func.now()))

restaurante_config = Table('restaurante_config', metadata,
    Column('id', Integer, primary_key=True), Column('nombre',String(150),nullable=False,server_default='Trattoria Bellavista'),
    Column('especialidad',String(120),nullable=False,server_default='Cucina Italiana'),
    Column('moneda',String(10),nullable=False,server_default='COP'), Column('ciudad',String(120)),
    Column('telefono',String(40)), Column('direccion',String(200)), Column('horario',String(160)),
    Column('updated_at',DateTime(timezone=True),nullable=False,server_default=func.now()))
