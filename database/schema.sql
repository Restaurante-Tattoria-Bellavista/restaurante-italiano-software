-- =====================================================================
-- Trattoria Bellavista — Esquema PostgreSQL
-- Historia de usuario: HU-08 — Creación del esquema PostgreSQL (issue #4)
-- Motor: PostgreSQL 16
--
-- Este script crea las 8 tablas del sistema en una base de datos vacía.
-- Las tablas (secciones 1 a 8) se basan en los modelos SQLAlchemy del
-- proyecto anterior: mismos tipos, nulabilidad, valores por defecto,
-- claves, restricciones e índices.
-- Las secciones 9 a 11 (HU-09) y 12 a 17 (HU-10) agregan reglas de
-- integridad para reservas y pedidos que antes solo validaba el backend.
-- Las secciones 18 a 23 (HU-12) agregan las consultas de los reportes.
--
-- Es idempotente: usa IF NOT EXISTS y CREATE OR REPLACE, así que puede
-- ejecutarse varias veces sin error.
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

-- =====================================================================
-- HU-09 — Reglas de integridad de mesas, clientes y reservas
--
-- El backend ya valida estas reglas antes de guardar. Aquí se repiten en
-- la base de datos para que se cumplan también si alguien inserta datos
-- por otro camino (un script, pgAdmin, un error en el código).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 9. Una mesa no puede tener dos reservas activas a menos de 2 horas.
--
-- Es la misma regla del backend (routers/reservas.py, VENTANA = 2 horas).
-- Cada reserva ocupa la franja [fecha_hora - 1h, fecha_hora + 1h). Dos
-- franjas de la misma mesa se cruzan justo cuando las horas están a menos
-- de 2 horas, y la restricción EXCLUDE no deja guardar la segunda.
-- Solo cuentan las reservas activas: una cancelada, completada o en la que
-- el cliente no asistió no bloquea la mesa.
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- PostgreSQL exige que las funciones usadas en una restricción sean
-- IMMUTABLE. Restar o sumar horas a un timestamptz siempre da el mismo
-- resultado, sin importar la zona horaria, así que la función es segura.
CREATE OR REPLACE FUNCTION reserva_franja(fecha_hora timestamptz)
RETURNS tstzrange
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT tstzrange(fecha_hora - interval '1 hour',
                     fecha_hora + interval '1 hour', '[)');
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ex_reservas_mesa_franja'
    ) THEN
        ALTER TABLE reservas
            ADD CONSTRAINT ex_reservas_mesa_franja
            EXCLUDE USING gist (
                mesa_id WITH =,
                reserva_franja(fecha_hora) WITH &&
            )
            WHERE (estado IN ('PENDIENTE', 'CONFIRMADA', 'EN_MESA'));
    END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 10. Las personas de una reserva no pueden superar la capacidad de la
--     mesa. Como compara dos tablas distintas, no se puede hacer con un
--     CHECK; se hace con un trigger que revisa antes de guardar.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validar_capacidad_reserva()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_capacidad integer;
BEGIN
    SELECT capacidad INTO v_capacidad FROM mesas WHERE id = NEW.mesa_id;

    -- Si la mesa no existe, la clave foránea es la que rechaza la fila.
    IF v_capacidad IS NOT NULL AND NEW.personas > v_capacidad THEN
        RAISE EXCEPTION
            'La reserva es para % personas y la mesa % solo tiene capacidad para %',
            NEW.personas, NEW.mesa_id, v_capacidad
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER tg_reservas_capacidad
    BEFORE INSERT OR UPDATE OF mesa_id, personas ON reservas
    FOR EACH ROW
    EXECUTE FUNCTION validar_capacidad_reserva();

-- El caso contrario: no se puede bajar la capacidad de una mesa por
-- debajo de una reserva activa que ya tiene.
CREATE OR REPLACE FUNCTION validar_capacidad_mesa()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM reservas r
        WHERE r.mesa_id = NEW.id
          AND r.estado IN ('PENDIENTE', 'CONFIRMADA', 'EN_MESA')
          AND r.personas > NEW.capacidad
    ) THEN
        RAISE EXCEPTION
            'La mesa % tiene reservas activas para más de % personas',
            NEW.id, NEW.capacidad
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER tg_mesas_capacidad
    BEFORE UPDATE OF capacidad ON mesas
    FOR EACH ROW
    WHEN (NEW.capacidad < OLD.capacidad)
    EXECUTE FUNCTION validar_capacidad_mesa();

-- ---------------------------------------------------------------------
-- 11. Índice para consultar la disponibilidad: reservas de una mesa en un
--     rango de fechas (la consulta que hace el backend antes de reservar).
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_reservas_mesa_fecha
    ON reservas (mesa_id, fecha_hora)
    WHERE estado IN ('PENDIENTE', 'CONFIRMADA', 'EN_MESA');

-- =====================================================================
-- HU-10 — Reglas de integridad de productos, pedidos y detalles
--
-- Igual que en la HU-09: el backend ya aplica estas reglas
-- (routers/operacion.py) y aquí se repiten en la base de datos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 12. El subtotal de cada línea es exactamente cantidad × precio_unitario.
--     precio_unitario guarda el precio del momento del pedido, así que si
--     el producto cambia de precio después, la línea no cambia.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_detalle_pedido_subtotal_correcto'
    ) THEN
        ALTER TABLE detalle_pedido
            ADD CONSTRAINT ck_detalle_pedido_subtotal_correcto
            CHECK (subtotal = cantidad * precio_unitario);
    END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 13. Un pedido cerrado tiene fecha de cierre y uno abierto no.
--     El backend llena closed_at al pasar a PAGADO o CANCELADO.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_pedidos_fecha_cierre'
    ) THEN
        ALTER TABLE pedidos
            ADD CONSTRAINT ck_pedidos_fecha_cierre
            CHECK (
                (estado IN ('PAGADO', 'CANCELADO')) = (closed_at IS NOT NULL)
                AND (closed_at IS NULL OR closed_at >= created_at)
            );
    END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 14. Una mesa solo puede tener un pedido activo a la vez.
--     Los pedidos pagados o cancelados no cuentan.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_mesa_activo
    ON pedidos (mesa_id)
    WHERE estado IN ('ABIERTO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO');

-- ---------------------------------------------------------------------
-- 15. Solo se pueden agregar, cambiar o quitar productos de un pedido
--     ABIERTO. Cuando ya está en cocina, pagado o cancelado, sus líneas
--     no se tocan.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validar_pedido_abierto()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_pedido_id integer;
    v_estado    varchar(30);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_pedido_id := OLD.pedido_id;
    ELSE
        v_pedido_id := NEW.pedido_id;
    END IF;

    SELECT estado INTO v_estado FROM pedidos WHERE id = v_pedido_id;

    -- Si el pedido no existe (porque se está borrando completo, o porque el
    -- id no es válido), decide la clave foránea, no este trigger.
    IF v_estado IS NOT NULL AND v_estado <> 'ABIERTO' THEN
        RAISE EXCEPTION
            'El pedido % está % y ya no se pueden modificar sus productos',
            v_pedido_id, v_estado
            USING ERRCODE = 'check_violation';
    END IF;

    -- Tampoco se puede pasar una línea de un pedido a otro que no esté abierto.
    IF TG_OP = 'UPDATE' AND NEW.pedido_id <> OLD.pedido_id THEN
        SELECT estado INTO v_estado FROM pedidos WHERE id = OLD.pedido_id;
        IF v_estado IS NOT NULL AND v_estado <> 'ABIERTO' THEN
            RAISE EXCEPTION
                'El pedido % está % y ya no se pueden modificar sus productos',
                OLD.pedido_id, v_estado
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER tg_detalle_pedido_abierto
    BEFORE INSERT OR UPDATE OR DELETE ON detalle_pedido
    FOR EACH ROW
    EXECUTE FUNCTION validar_pedido_abierto();

-- ---------------------------------------------------------------------
-- 16. El total del pedido siempre es la suma de los subtotales.
--
-- Cada vez que cambia una línea, se recalcula el total del pedido. Y si
-- alguien intenta cambiar el total a mano, se vuelve a calcular, así que
-- no puede quedar un total que no coincida con las líneas.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calcular_total_pedido()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.total := COALESCE(
        (SELECT SUM(subtotal) FROM detalle_pedido WHERE pedido_id = NEW.id),
        0
    );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER tg_pedidos_total
    BEFORE INSERT OR UPDATE OF total ON pedidos
    FOR EACH ROW
    EXECUTE FUNCTION calcular_total_pedido();

CREATE OR REPLACE FUNCTION actualizar_total_pedido()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Basta con "tocar" el total: el trigger tg_pedidos_total lo calcula.
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        UPDATE pedidos SET total = total WHERE id = OLD.pedido_id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.pedido_id <> OLD.pedido_id) THEN
        UPDATE pedidos SET total = total WHERE id = NEW.pedido_id;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER tg_detalle_pedido_total
    AFTER INSERT OR UPDATE OF cantidad, precio_unitario, subtotal, pedido_id OR DELETE
    ON detalle_pedido
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_total_pedido();

-- ---------------------------------------------------------------------
-- 17. Vista para consultar un pedido completo: cada línea con los datos
--     del pedido, la mesa y el nombre del producto.
--
--     SELECT * FROM v_pedidos_detalle WHERE pedido_id = 5;
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_pedidos_detalle AS
SELECT
    p.id              AS pedido_id,
    p.estado          AS pedido_estado,
    p.total           AS pedido_total,
    p.created_at      AS pedido_creado,
    p.closed_at       AS pedido_cerrado,
    m.id              AS mesa_id,
    m.numero          AS mesa_numero,
    d.id              AS detalle_id,
    pr.id             AS producto_id,
    pr.nombre         AS producto_nombre,
    pr.categoria      AS producto_categoria,
    d.cantidad,
    d.precio_unitario,
    d.subtotal,
    d.observacion
FROM pedidos p
JOIN mesas m               ON m.id = p.mesa_id
LEFT JOIN detalle_pedido d ON d.pedido_id = p.id
LEFT JOIN productos pr     ON pr.id = d.producto_id;

-- =====================================================================
-- HU-12 — Consultas e indicadores para reportes
--
-- Funciones y vistas que usan los reportes. La explicación, los ejemplos
-- y los resultados esperados están en database/reportes.md.
--
-- Reglas comunes:
--   - Una venta cuenta el día en que el pedido se PAGÓ (closed_at), no el
--     día en que se abrió.
--   - Las fechas se reciben como días (desde y hasta, ambos incluidos) y se
--     interpretan en la zona horaria del restaurante (por defecto
--     America/Bogota). Así, un pedido pagado a las 11:50 p. m. cuenta ese
--     mismo día aunque en UTC ya sea el día siguiente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 18. Índice para las ventas por rango de fechas: solo pedidos pagados,
--     ordenados por fecha de pago.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_pedidos_pagados_cierre
    ON pedidos (closed_at)
    WHERE estado = 'PAGADO';

-- ---------------------------------------------------------------------
-- 19. Resumen de ventas: pedidos pagados, total vendido, ticket promedio
--     y pedidos cancelados en un rango de días.
--
--     SELECT * FROM fn_resumen_ventas('2026-10-01', '2026-10-31');
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_resumen_ventas(
    p_desde date,
    p_hasta date,
    p_zona  text DEFAULT 'America/Bogota'
)
RETURNS TABLE (
    pedidos_pagados    bigint,
    ventas             numeric(14, 2),
    ticket_promedio    numeric(14, 2),
    pedidos_cancelados bigint
)
LANGUAGE sql
STABLE
AS $$
    WITH rango AS (
        SELECT (p_desde::timestamp       AT TIME ZONE p_zona) AS inicio,
               ((p_hasta + 1)::timestamp AT TIME ZONE p_zona) AS fin
    )
    SELECT
        count(*) FILTER (WHERE p.estado = 'PAGADO'),
        COALESCE(sum(p.total) FILTER (WHERE p.estado = 'PAGADO'), 0)::numeric(14, 2),
        COALESCE(round(avg(p.total) FILTER (WHERE p.estado = 'PAGADO'), 2), 0)::numeric(14, 2),
        count(*) FILTER (WHERE p.estado = 'CANCELADO')
    FROM pedidos p, rango r
    WHERE p.estado IN ('PAGADO', 'CANCELADO')
      AND p.closed_at >= r.inicio
      AND p.closed_at <  r.fin;
$$;

-- ---------------------------------------------------------------------
-- 20. Ranking de productos vendidos en un rango de días, por unidades y
--     por ingresos. Solo cuentan los pedidos pagados.
--
--     SELECT * FROM fn_ranking_productos('2026-10-01', '2026-10-31');
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_ranking_productos(
    p_desde date,
    p_hasta date,
    p_zona  text DEFAULT 'America/Bogota'
)
RETURNS TABLE (
    posicion        bigint,
    producto_id     integer,
    nombre          varchar(150),
    categoria       varchar(30),
    unidades        bigint,
    ingresos        numeric(14, 2),
    pedidos         bigint
)
LANGUAGE sql
STABLE
AS $$
    WITH rango AS (
        SELECT (p_desde::timestamp       AT TIME ZONE p_zona) AS inicio,
               ((p_hasta + 1)::timestamp AT TIME ZONE p_zona) AS fin
    ),
    vendidos AS (
        SELECT
            pr.id                       AS producto_id,
            pr.nombre,
            pr.categoria,
            sum(d.cantidad)::bigint     AS unidades,
            sum(d.subtotal)             AS ingresos,
            count(DISTINCT p.id)        AS pedidos
        FROM pedidos p
        CROSS JOIN rango r
        JOIN detalle_pedido d ON d.pedido_id = p.id
        JOIN productos pr     ON pr.id = d.producto_id
        WHERE p.estado = 'PAGADO'
          AND p.closed_at >= r.inicio
          AND p.closed_at <  r.fin
        GROUP BY pr.id, pr.nombre, pr.categoria
    )
    SELECT
        row_number() OVER (ORDER BY unidades DESC, ingresos DESC, nombre),
        producto_id,
        nombre,
        categoria,
        unidades,
        ingresos::numeric(14, 2),
        pedidos
    FROM vendidos
    ORDER BY 1;
$$;

-- ---------------------------------------------------------------------
-- 21. Mesas más utilizadas en un rango de días: cuántos pedidos pagados
--     tuvo cada mesa y cuánto se vendió en ella.
--
--     SELECT * FROM fn_mesas_mas_utilizadas('2026-10-01', '2026-10-31');
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_mesas_mas_utilizadas(
    p_desde date,
    p_hasta date,
    p_zona  text DEFAULT 'America/Bogota'
)
RETURNS TABLE (
    posicion     bigint,
    mesa_id      integer,
    mesa_numero  integer,
    pedidos      bigint,
    ventas       numeric(14, 2)
)
LANGUAGE sql
STABLE
AS $$
    WITH rango AS (
        SELECT (p_desde::timestamp       AT TIME ZONE p_zona) AS inicio,
               ((p_hasta + 1)::timestamp AT TIME ZONE p_zona) AS fin
    ),
    uso AS (
        SELECT m.id AS mesa_id, m.numero AS mesa_numero,
               count(*) AS pedidos, sum(p.total) AS ventas
        FROM pedidos p
        CROSS JOIN rango r
        JOIN mesas m ON m.id = p.mesa_id
        WHERE p.estado = 'PAGADO'
          AND p.closed_at >= r.inicio
          AND p.closed_at <  r.fin
        GROUP BY m.id, m.numero
    )
    SELECT
        row_number() OVER (ORDER BY pedidos DESC, ventas DESC, mesa_numero),
        mesa_id, mesa_numero, pedidos, ventas::numeric(14, 2)
    FROM uso
    ORDER BY 1;
$$;

-- ---------------------------------------------------------------------
-- 22. Reservas por estado en un rango de días (según el día de la
--     reserva). Siempre devuelve los 6 estados, aunque alguno tenga 0.
--
--     SELECT * FROM fn_reservas_por_estado('2026-10-01', '2026-10-31');
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_reservas_por_estado(
    p_desde date,
    p_hasta date,
    p_zona  text DEFAULT 'America/Bogota'
)
RETURNS TABLE (
    estado    varchar(30),
    reservas  bigint,
    personas  bigint
)
LANGUAGE sql
STABLE
AS $$
    WITH rango AS (
        SELECT (p_desde::timestamp       AT TIME ZONE p_zona) AS inicio,
               ((p_hasta + 1)::timestamp AT TIME ZONE p_zona) AS fin
    ),
    estados (estado, orden) AS (
        VALUES ('PENDIENTE', 1), ('CONFIRMADA', 2), ('EN_MESA', 3),
               ('COMPLETADA', 4), ('CANCELADA', 5), ('NO_ASISTIO', 6)
    )
    SELECT
        e.estado::varchar(30),
        count(r.id),
        COALESCE(sum(r.personas), 0)::bigint
    FROM estados e
    CROSS JOIN rango rg
    LEFT JOIN reservas r
           ON r.estado = e.estado
          AND r.fecha_hora >= rg.inicio
          AND r.fecha_hora <  rg.fin
    GROUP BY e.estado, e.orden
    ORDER BY e.orden;
$$;

-- ---------------------------------------------------------------------
-- 23. Distribución actual de las mesas activas por estado, con su
--     porcentaje. Siempre devuelve los 4 estados.
--
--     SELECT * FROM v_mesas_por_estado;
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_mesas_por_estado AS
WITH estados (estado, orden) AS (
    VALUES ('LIBRE', 1), ('RESERVADA', 2), ('OCUPADA', 3), ('FUERA_DE_SERVICIO', 4)
),
conteo AS (
    SELECT e.estado, e.orden, count(m.id) AS mesas
    FROM estados e
    LEFT JOIN mesas m ON m.estado = e.estado AND m.activo
    GROUP BY e.estado, e.orden
)
SELECT
    estado::varchar(30) AS estado,
    mesas,
    CASE WHEN sum(mesas) OVER () = 0 THEN 0
         ELSE round(100.0 * mesas / sum(mesas) OVER (), 1)
    END AS porcentaje
FROM conteo
ORDER BY orden;

COMMIT;
