from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Integer,
    Numeric,
    String,
    Table,
    func,
)

from app.models.catalogo import metadata


restaurante_config = Table(
    "restaurante_config",
    metadata,
    Column(
        "id",
        Integer,
        primary_key=True,
    ),
    Column(
        "nombre",
        String(150),
        nullable=False,
    ),
    Column(
        "nit",
        String(30),
        nullable=True,
    ),
    Column(
        "telefono",
        String(30),
        nullable=False,
    ),
    Column(
        "correo",
        String(150),
        nullable=False,
    ),
    Column(
        "direccion",
        String(200),
        nullable=False,
    ),
    Column(
        "ciudad",
        String(100),
        nullable=False,
    ),
    Column(
        "moneda",
        String(10),
        nullable=False,
        server_default="COP",
    ),
    Column(
        "zona_horaria",
        String(80),
        nullable=False,
        server_default="America/Bogota",
    ),
    Column(
        "porcentaje_servicio",
        Numeric(5, 2),
        nullable=False,
        server_default="10.00",
    ),
    Column(
        "activo",
        Boolean,
        nullable=False,
        server_default="true",
    ),
    Column(
        "created_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    ),
    Column(
        "updated_at",
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    ),
    CheckConstraint(
        "moneda IN ('COP', 'USD', 'EUR')",
        name="ck_restaurante_config_moneda",
    ),
    CheckConstraint(
        (
            "porcentaje_servicio >= 0 "
            "AND porcentaje_servicio <= 100"
        ),
        name="ck_restaurante_config_servicio",
    ),
)