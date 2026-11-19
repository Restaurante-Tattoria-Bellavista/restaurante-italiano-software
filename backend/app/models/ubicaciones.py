"""Etiquetas BLE de los meseros y su zona actual (solo estado actual, sin historial)."""
from sqlalchemy import Table, Column, Integer, String, DateTime, ForeignKey, func

from app.models.catalogo import metadata

etiquetas_ubicacion = Table(
    "etiquetas_ubicacion", metadata,
    Column("etiqueta_id", String(40), primary_key=True),
    Column("usuario_id", Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, unique=True),
)

ubicaciones_actuales = Table(
    "ubicaciones_actuales", metadata,
    Column("usuario_id", Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True),
    Column("zona", String(60), nullable=False),
    Column("rssi", Integer, nullable=False),
    Column("actualizado_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)
