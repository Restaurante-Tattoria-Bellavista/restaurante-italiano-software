-- =====================================================================
-- Trattoria Bellavista ÔÇö Esquema PostgreSQL
-- Historia de usuario: HU-08 ÔÇö Creaci├│n del esquema PostgreSQL (issue #4)
-- Motor: PostgreSQL 16
--
-- Este script crea las 8 tablas del sistema en una base de datos vac├¡a.
-- Reproduce exactamente el esquema que genera el backend con SQLAlchemy
-- (backend/app/models/ + backend/app/database/init_db.py): mismos tipos,
-- nulabilidad, valores por defecto, claves, restricciones e ├¡ndices.
--
-- Es idempotente: usa IF NOT EXISTS, as├¡ que puede ejecutarse varias veces
-- sin error y convive con Base.metadata.create_all() del backend.
--
-- No contiene credenciales. La conexi├│n se configura con variables de
-- entorno (ver database/README.md).
--
-- Uso:
--   psql -h <host> -U <usuario> -d <base> -f database/schema.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. restaurante_config ÔÇö configuraci├│n general (se espera una fila)
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
-- 2. mesas ÔÇö mesas f├¡sicas del restaurante
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
-- 3. mesa_layout ÔÇö posici├│n de cada mesa en el plano (relaci├│n 1 a 1)
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
-- 5. productos ÔÇö platos y bebidas del men├║
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
-- 6. pedidos ÔÇö pedido abierto en una mesa
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
-- 7. reservas ÔÇö reserva de una mesa por un cliente
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
-- 8. detalle_pedido ÔÇö productos incluidos en cada pedido
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

-- ---------------------------------------------------------------------
-- Autenticacion: usuarios del sistema e ingreso facial (feature/login-facial)
-- Roles: ADMIN (acceso total y gestion de usuarios) y PERSONAL (operacion).
-- rostro_descriptor: vector de 128 valores generado en el navegador (face-api.js).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id                SERIAL        NOT NULL,
    username          VARCHAR(60)   NOT NULL,
    nombre            VARCHAR(120)  NOT NULL,
    rol               VARCHAR(20)   NOT NULL,
    password_hash     VARCHAR(255),
    rostro_descriptor DOUBLE PRECISION[],
    activo            BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT pk_usuarios PRIMARY KEY (id),
    CONSTRAINT uq_usuarios_username UNIQUE (username),
    CONSTRAINT ck_usuarios_rol CHECK (rol IN ('ADMIN', 'PERSONAL'))
);

-- ---------------------------------------------------------------------
-- Seguridad de acceso: bloqueo tras intentos fallidos y auditoria de ingresos.
-- Idempotente: sirve para bases nuevas y para bases ya creadas.
-- ---------------------------------------------------------------------
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS intentos_fallidos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bloqueado_hasta TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS auditoria_accesos (
    id               SERIAL       NOT NULL,
    usuario_id       INTEGER,
    username_intento VARCHAR(60),
    metodo           VARCHAR(20)  NOT NULL,
    exitoso          BOOLEAN      NOT NULL,
    motivo           VARCHAR(60)  NOT NULL,
    ip               VARCHAR(64),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT pk_auditoria_accesos PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS ix_auditoria_accesos_created_at ON auditoria_accesos (created_at);

-- ---------------------------------------------------------------------
-- Reconocimiento facial con varias perspectivas (FRENTE, IZQUIERDA, DERECHA, ARRIBA, ABAJO).
-- Cada persona puede tener varias plantillas. Idempotente.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rostro_plantillas (
    id          SERIAL            NOT NULL,
    usuario_id  INTEGER           NOT NULL,
    pose        VARCHAR(20)       NOT NULL,
    descriptor  DOUBLE PRECISION[] NOT NULL,
    created_at  TIMESTAMPTZ       NOT NULL DEFAULT now(),
    CONSTRAINT pk_rostro_plantillas PRIMARY KEY (id),
    CONSTRAINT fk_rostro_plantillas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
    CONSTRAINT ck_rostro_pose CHECK (pose IN ('FRENTE', 'IZQUIERDA', 'DERECHA', 'ARRIBA', 'ABAJO'))
);
CREATE INDEX IF NOT EXISTS ix_rostro_plantillas_usuario_id ON rostro_plantillas (usuario_id);

-- Migra el rostro de una sola toma (version anterior) y elimina la columna.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'usuarios' AND column_name = 'rostro_descriptor'
    ) THEN
        INSERT INTO rostro_plantillas (usuario_id, pose, descriptor)
        SELECT id, 'FRENTE', rostro_descriptor
        FROM usuarios
        WHERE rostro_descriptor IS NOT NULL;
        ALTER TABLE usuarios DROP COLUMN rostro_descriptor;
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- Ubicacion del personal con etiquetas BLE (gateways de zona).
-- Solo guarda la zona actual de cada persona, sin historial. Idempotente.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS etiquetas_ubicacion (
    etiqueta_id VARCHAR(40) NOT NULL,
    usuario_id  INTEGER     NOT NULL,
    CONSTRAINT pk_etiquetas_ubicacion PRIMARY KEY (etiqueta_id),
    CONSTRAINT uq_etiquetas_ubicacion_usuario UNIQUE (usuario_id),
    CONSTRAINT fk_etiquetas_ubicacion_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ubicaciones_actuales (
    usuario_id    INTEGER      NOT NULL,
    zona          VARCHAR(60)  NOT NULL,
    rssi          INTEGER      NOT NULL,
    actualizado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_ubicaciones_actuales PRIMARY KEY (usuario_id),
    CONSTRAINT fk_ubicaciones_actuales_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
);

COMMIT;
