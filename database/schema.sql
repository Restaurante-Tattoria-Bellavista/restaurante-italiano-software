-- =====================================================================
-- Trattoria Bellavista — Esquema PostgreSQL
-- Historia de usuario: HU-08 — Creación del esquema PostgreSQL (issue #4)
-- Motor: PostgreSQL 16
--
-- Este script crea las 8 tablas del sistema en una base de datos vacía.
-- Reproduce exactamente el esquema que genera el backend con SQLAlchemy
-- (backend/app/models/ + backend/app/database/init_db.py): mismos tipos,
-- nulabilidad, valores por defecto, claves, restricciones e índices.
--
-- Es idempotente: usa IF NOT EXISTS, así que puede ejecutarse varias veces
-- sin error y convive con Base.metadata.create_all() del backend.
--
-- No contiene credenciales. La conexión se configura con variables de
-- entorno (ver database/README.md).
--
-- Uso:
--   psql -h <host> -U <usuario> -d <base> -f database/schema.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. restaurante_config — configuración general (se espera una fila)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS restaurante_config (
    id            SERIAL       NOT NULL,
    nombre        VARCHAR(150) NOT NULL DEFAULT 'Trattoria Bellavista',
    especialidad  VARCHAR(120) NOT NULL DEFAULT 'Cucina Italiana',
    moneda        VARCHAR(10)  NOT NULL DEFAULT 'COP',
    ciudad        VARCHAR(120),
    telefono      VARCHAR(40),
    direccion     VARCHAR(200),
    horario       VARCHAR(160),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT restaurante_config_pkey PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------
-- 2. mesas — mesas físicas del restaurante
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mesas (
    id          SERIAL       NOT NULL,
    numero      INTEGER      NOT NULL,
    capacidad   INTEGER      NOT NULL,
    ubicacion   VARCHAR(100),
    estado      VARCHAR(30)  NOT NULL DEFAULT 'LIBRE',
    activo      BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT mesas_pkey PRIMARY KEY (id),
    CONSTRAINT ck_mesas_capacidad_positiva CHECK (capacidad > 0),
    CONSTRAINT ck_mesas_estado_valido
        CHECK (estado IN ('LIBRE', 'OCUPADA', 'RESERVADA', 'FUERA_DE_SERVICIO'))
);

CREATE INDEX        IF NOT EXISTS ix_mesas_id     ON mesas (id);
CREATE UNIQUE INDEX IF NOT EXISTS ix_mesas_numero ON mesas (numero);

-- ---------------------------------------------------------------------
-- 3. mesa_layout — posición de cada mesa en el plano (relación 1 a 1)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mesa_layout (
    mesa_id     INTEGER      NOT NULL,
    zona        VARCHAR(30)  NOT NULL DEFAULT 'SALON',
    pos_x       NUMERIC(5, 2) NOT NULL,
    pos_y       NUMERIC(5, 2) NOT NULL,
    forma       VARCHAR(20)  NOT NULL DEFAULT 'ROUND',
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT mesa_layout_pkey PRIMARY KEY (mesa_id),
    CONSTRAINT mesa_layout_mesa_id_fkey
        FOREIGN KEY (mesa_id) REFERENCES mesas (id) ON DELETE CASCADE,
    CONSTRAINT ck_mesa_layout_pos_x CHECK (pos_x >= 0 AND pos_x <= 100),
    CONSTRAINT ck_mesa_layout_pos_y CHECK (pos_y >= 0 AND pos_y <= 100),
    CONSTRAINT ck_mesa_layout_zona
        CHECK (zona IN ('SALON', 'TERRAZA', 'VIP', 'BAR', 'OTRA')),
    CONSTRAINT ck_mesa_layout_forma
        CHECK (forma IN ('ROUND', 'RECT', 'SMALL'))
);

-- ---------------------------------------------------------------------
-- 4. clientes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
    id             SERIAL       NOT NULL,
    nombre         VARCHAR(150) NOT NULL,
    telefono       VARCHAR(30),
    email          VARCHAR(150),
    observaciones  TEXT,
    activo         BOOLEAN      NOT NULL DEFAULT true,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT clientes_pkey PRIMARY KEY (id)
);

CREATE INDEX        IF NOT EXISTS ix_clientes_id       ON clientes (id);
CREATE INDEX        IF NOT EXISTS ix_clientes_nombre   ON clientes (nombre);
CREATE INDEX        IF NOT EXISTS ix_clientes_telefono ON clientes (telefono);
CREATE UNIQUE INDEX IF NOT EXISTS ix_clientes_email    ON clientes (email);

-- ---------------------------------------------------------------------
-- 5. productos — platos y bebidas del menú
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS productos (
    id           SERIAL        NOT NULL,
    nombre       VARCHAR(150)  NOT NULL,
    descripcion  TEXT,
    precio       NUMERIC(12, 2) NOT NULL,
    categoria    VARCHAR(30)   NOT NULL DEFAULT 'OTRO',
    disponible   BOOLEAN       NOT NULL DEFAULT true,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT productos_pkey PRIMARY KEY (id),
    CONSTRAINT ck_productos_precio_positivo CHECK (precio > 0),
    CONSTRAINT ck_productos_categoria_valida
        CHECK (categoria IN ('ENTRADA', 'PLATO_FUERTE', 'BEBIDA', 'POSTRE', 'OTRO'))
);

CREATE INDEX        IF NOT EXISTS ix_productos_id     ON productos (id);
CREATE UNIQUE INDEX IF NOT EXISTS ix_productos_nombre ON productos (nombre);

-- ---------------------------------------------------------------------
-- 6. pedidos — pedido abierto en una mesa
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos (
    id          SERIAL        NOT NULL,
    mesa_id     INTEGER       NOT NULL,
    estado      VARCHAR(30)   NOT NULL DEFAULT 'ABIERTO',
    total       NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    closed_at   TIMESTAMP WITH TIME ZONE,
    CONSTRAINT pedidos_pkey PRIMARY KEY (id),
    CONSTRAINT pedidos_mesa_id_fkey
        FOREIGN KEY (mesa_id) REFERENCES mesas (id) ON DELETE RESTRICT,
    CONSTRAINT ck_pedidos_estado_valido
        CHECK (estado IN ('ABIERTO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'PAGADO', 'CANCELADO')),
    CONSTRAINT ck_pedidos_total_no_negativo CHECK (total >= 0)
);

CREATE INDEX IF NOT EXISTS ix_pedidos_id      ON pedidos (id);
CREATE INDEX IF NOT EXISTS ix_pedidos_mesa_id ON pedidos (mesa_id);
CREATE INDEX IF NOT EXISTS ix_pedidos_estado  ON pedidos (estado);

-- ---------------------------------------------------------------------
-- 7. reservas — reserva de una mesa por un cliente
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservas (
    id             SERIAL      NOT NULL,
    mesa_id        INTEGER     NOT NULL,
    cliente_id     INTEGER     NOT NULL,
    fecha_hora     TIMESTAMP WITH TIME ZONE NOT NULL,
    personas       INTEGER     NOT NULL,
    estado         VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
    observaciones  TEXT,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT reservas_pkey PRIMARY KEY (id),
    CONSTRAINT reservas_mesa_id_fkey
        FOREIGN KEY (mesa_id) REFERENCES mesas (id) ON DELETE RESTRICT,
    CONSTRAINT reservas_cliente_id_fkey
        FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON DELETE RESTRICT,
    CONSTRAINT ck_reservas_personas_positivas CHECK (personas > 0),
    CONSTRAINT ck_reservas_estado_valido
        CHECK (estado IN ('PENDIENTE', 'CONFIRMADA', 'EN_MESA', 'COMPLETADA', 'CANCELADA', 'NO_ASISTIO'))
);

CREATE INDEX IF NOT EXISTS ix_reservas_id         ON reservas (id);
CREATE INDEX IF NOT EXISTS ix_reservas_mesa_id    ON reservas (mesa_id);
CREATE INDEX IF NOT EXISTS ix_reservas_cliente_id ON reservas (cliente_id);
CREATE INDEX IF NOT EXISTS ix_reservas_fecha_hora ON reservas (fecha_hora);
CREATE INDEX IF NOT EXISTS ix_reservas_estado     ON reservas (estado);

-- ---------------------------------------------------------------------
-- 8. detalle_pedido — productos incluidos en cada pedido
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS detalle_pedido (
    id               SERIAL        NOT NULL,
    pedido_id        INTEGER       NOT NULL,
    producto_id      INTEGER       NOT NULL,
    cantidad         INTEGER       NOT NULL,
    precio_unitario  NUMERIC(12, 2) NOT NULL,
    subtotal         NUMERIC(12, 2) NOT NULL,
    observacion      VARCHAR(250),
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT detalle_pedido_pkey PRIMARY KEY (id),
    CONSTRAINT detalle_pedido_pedido_id_fkey
        FOREIGN KEY (pedido_id) REFERENCES pedidos (id) ON DELETE CASCADE,
    CONSTRAINT detalle_pedido_producto_id_fkey
        FOREIGN KEY (producto_id) REFERENCES productos (id) ON DELETE RESTRICT,
    CONSTRAINT ck_detalle_pedido_cantidad_positiva CHECK (cantidad > 0),
    CONSTRAINT ck_detalle_pedido_precio_positivo CHECK (precio_unitario > 0),
    CONSTRAINT ck_detalle_pedido_subtotal_positivo CHECK (subtotal > 0),
    CONSTRAINT uq_detalle_pedido_producto UNIQUE (pedido_id, producto_id)
);

CREATE INDEX IF NOT EXISTS ix_detalle_pedido_id          ON detalle_pedido (id);
CREATE INDEX IF NOT EXISTS ix_detalle_pedido_pedido_id   ON detalle_pedido (pedido_id);
CREATE INDEX IF NOT EXISTS ix_detalle_pedido_producto_id ON detalle_pedido (producto_id);

COMMIT;
