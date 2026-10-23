-- =====================================================================
-- Trattoria Bellavista — Verificación del esquema PostgreSQL
-- Historias de usuario: HU-08 (issue #4) y HU-09 (issue #9)
--
-- Comprueba que database/schema.sql quedó bien aplicado:
--   1. Que existan las 8 tablas, sus claves y sus índices.
--   2. Que las restricciones de integridad rechacen datos inválidos.
--
-- Es seguro: las pruebas de la parte 2 corren dentro de una transacción
-- que se deshace al final (ROLLBACK). No deja datos en la base.
--
-- Uso:
--   psql -h <host> -U <usuario> -d <base> -f database/verify_schema.sql
--
-- Resultado esperado: todas las líneas dicen "OK" y la última dice
-- "VERIFICACION COMPLETA: n/n pruebas superadas".
-- =====================================================================

\set ON_ERROR_STOP on
\pset footer off

\echo
\echo '== 1. Tablas del esquema (se esperan 8) =='
SELECT table_name AS tabla
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('restaurante_config', 'mesas', 'mesa_layout', 'clientes',
                     'productos', 'pedidos', 'reservas', 'detalle_pedido')
ORDER BY table_name;

\echo '== 2. Restricciones por tabla (PK, FK, UNIQUE, CHECK) =='
SELECT c.conrelid::regclass AS tabla,
       count(*) FILTER (WHERE c.contype = 'p') AS pk,
       count(*) FILTER (WHERE c.contype = 'f') AS fk,
       count(*) FILTER (WHERE c.contype = 'u') AS unique_,
       count(*) FILTER (WHERE c.contype = 'c') AS check_
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname = 'public'
GROUP BY c.conrelid
ORDER BY 1::text;

\echo '== 3. Claves foráneas y regla al eliminar =='
SELECT conrelid::regclass AS tabla,
       conname AS restriccion,
       confrelid::regclass AS referencia,
       CASE confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT'
                        WHEN 'a' THEN 'NO ACTION' ELSE confdeltype::text END AS al_eliminar
FROM pg_constraint
WHERE contype = 'f' AND connamespace = 'public'::regnamespace
ORDER BY 1::text, 2;

\echo '== 4. Índices únicos =='
SELECT tablename AS tabla, indexname AS indice
FROM pg_indexes
WHERE schemaname = 'public' AND indexdef LIKE 'CREATE UNIQUE INDEX%'
  AND indexname NOT LIKE '%_pkey'
ORDER BY 1, 2;

\echo
\echo '== 5. Pruebas de integridad (se deshacen al final) =='

\set QUIET on
BEGIN;

CREATE TEMP TABLE _resultado (n serial, prueba text, ok boolean);

-- Ejecuta una sentencia que DEBE fallar con el código SQLSTATE indicado.
CREATE PROCEDURE pg_temp.debe_fallar(p_prueba text, p_sql text, p_codigo text)
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
        INSERT INTO _resultado (prueba, ok) VALUES (p_prueba, false);
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _resultado (prueba, ok) VALUES (p_prueba, SQLSTATE = p_codigo);
    END;
END;
$$;

-- Ejecuta una sentencia que DEBE funcionar.
CREATE PROCEDURE pg_temp.debe_funcionar(p_prueba text, p_sql text)
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
        INSERT INTO _resultado (prueba, ok) VALUES (p_prueba, true);
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _resultado (prueba, ok) VALUES (p_prueba || ' [' || SQLERRM || ']', false);
    END;
END;
$$;

-- Datos válidos de prueba (valores altos para no chocar con datos reales).
CALL pg_temp.debe_funcionar('Insertar mesa válida (valores por defecto)',
    $q$INSERT INTO mesas (id, numero, capacidad) VALUES (9001, 9001, 4)$q$);
CALL pg_temp.debe_funcionar('Insertar posición de la mesa en el plano',
    $q$INSERT INTO mesa_layout (mesa_id, pos_x, pos_y) VALUES (9001, 50, 50)$q$);
CALL pg_temp.debe_funcionar('Insertar cliente válido',
    $q$INSERT INTO clientes (id, nombre, email) VALUES (9001, 'Cliente Prueba', 'prueba.9001@example.com')$q$);
CALL pg_temp.debe_funcionar('Insertar producto válido',
    $q$INSERT INTO productos (id, nombre, precio) VALUES (9001, 'Producto Prueba 9001', 10000)$q$);
CALL pg_temp.debe_funcionar('Insertar pedido válido',
    $q$INSERT INTO pedidos (id, mesa_id) VALUES (9001, 9001)$q$);
CALL pg_temp.debe_funcionar('Insertar línea de pedido válida',
    $q$INSERT INTO detalle_pedido (id, pedido_id, producto_id, cantidad, precio_unitario, subtotal)
       VALUES (9001, 9001, 9001, 2, 10000, 20000)$q$);
CALL pg_temp.debe_funcionar('Insertar reserva válida',
    $q$INSERT INTO reservas (id, mesa_id, cliente_id, fecha_hora, personas)
       VALUES (9001, 9001, 9001, now() + interval '1 day', 2)$q$);

-- Valores por defecto.
INSERT INTO _resultado (prueba, ok)
SELECT 'Valores por defecto de mesas (LIBRE, activo = true)',
       estado = 'LIBRE' AND activo FROM mesas WHERE id = 9001;
INSERT INTO _resultado (prueba, ok)
SELECT 'Valores por defecto de pedidos (ABIERTO, total = 0)',
       estado = 'ABIERTO' AND total = 0 FROM pedidos WHERE id = 9001;
INSERT INTO _resultado (prueba, ok)
SELECT 'Valores por defecto de mesa_layout (SALON, ROUND)',
       zona = 'SALON' AND forma = 'ROUND' FROM mesa_layout WHERE mesa_id = 9001;

-- Códigos SQLSTATE: 23505 = único, 23503 = clave foránea,
-- 23514 = CHECK, 23502 = NOT NULL.
CALL pg_temp.debe_fallar('Rechaza número de mesa repetido',
    $q$INSERT INTO mesas (numero, capacidad) VALUES (9001, 2)$q$, '23505');
CALL pg_temp.debe_fallar('Rechaza capacidad 0',
    $q$INSERT INTO mesas (numero, capacidad) VALUES (9002, 0)$q$, '23514');
CALL pg_temp.debe_fallar('Rechaza estado de mesa inválido',
    $q$INSERT INTO mesas (numero, capacidad, estado) VALUES (9003, 2, 'ROTA')$q$, '23514');
CALL pg_temp.debe_fallar('Rechaza mesa sin número (NOT NULL)',
    $q$INSERT INTO mesas (capacidad) VALUES (2)$q$, '23502');
CALL pg_temp.debe_fallar('Rechaza posición fuera del plano (pos_x > 100)',
    $q$UPDATE mesa_layout SET pos_x = 150 WHERE mesa_id = 9001$q$, '23514');
CALL pg_temp.debe_fallar('Rechaza zona inválida',
    $q$UPDATE mesa_layout SET zona = 'COCINA' WHERE mesa_id = 9001$q$, '23514');
CALL pg_temp.debe_fallar('Rechaza layout de una mesa inexistente',
    $q$INSERT INTO mesa_layout (mesa_id, pos_x, pos_y) VALUES (999999, 1, 1)$q$, '23503');
CALL pg_temp.debe_fallar('Rechaza correo de cliente repetido',
    $q$INSERT INTO clientes (nombre, email) VALUES ('Otro', 'prueba.9001@example.com')$q$, '23505');
CALL pg_temp.debe_funcionar('Permite varios clientes sin correo',
    $q$INSERT INTO clientes (nombre) VALUES ('Sin correo A'), ('Sin correo B')$q$);
CALL pg_temp.debe_fallar('Rechaza producto con nombre repetido',
    $q$INSERT INTO productos (nombre, precio) VALUES ('Producto Prueba 9001', 5000)$q$, '23505');
CALL pg_temp.debe_fallar('Rechaza precio 0',
    $q$INSERT INTO productos (nombre, precio) VALUES ('Gratis', 0)$q$, '23514');
CALL pg_temp.debe_fallar('Rechaza categoría inválida',
    $q$INSERT INTO productos (nombre, precio, categoria) VALUES ('X', 100, 'SOPA')$q$, '23514');
CALL pg_temp.debe_fallar('Rechaza pedido en mesa inexistente',
    $q$INSERT INTO pedidos (mesa_id) VALUES (999999)$q$, '23503');
CALL pg_temp.debe_fallar('Rechaza estado de pedido inválido',
    $q$UPDATE pedidos SET estado = 'PERDIDO' WHERE id = 9001$q$, '23514');
CALL pg_temp.debe_fallar('Rechaza total negativo',
    $q$UPDATE pedidos SET total = -1 WHERE id = 9001$q$, '23514');
CALL pg_temp.debe_fallar('Rechaza el mismo producto dos veces en un pedido',
    $q$INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal)
       VALUES (9001, 9001, 1, 10000, 10000)$q$, '23505');
CALL pg_temp.debe_fallar('Rechaza cantidad 0',
    $q$UPDATE detalle_pedido SET cantidad = 0 WHERE id = 9001$q$, '23514');
CALL pg_temp.debe_fallar('Rechaza reserva para 0 personas',
    $q$INSERT INTO reservas (mesa_id, cliente_id, fecha_hora, personas)
       VALUES (9001, 9001, now(), 0)$q$, '23514');
CALL pg_temp.debe_fallar('Rechaza estado de reserva inválido',
    $q$UPDATE reservas SET estado = 'OLVIDADA' WHERE id = 9001$q$, '23514');
CALL pg_temp.debe_fallar('Rechaza reserva de cliente inexistente',
    $q$INSERT INTO reservas (mesa_id, cliente_id, fecha_hora, personas)
       VALUES (9001, 999999, now(), 2)$q$, '23503');

-- HU-09: reservas que se cruzan y capacidad de la mesa.
-- La reserva 9001 es para 2 personas en la mesa 9001 (capacidad 4).
-- Códigos: 23P01 = choque con la restricción EXCLUDE, 23514 = regla violada.
CALL pg_temp.debe_fallar('HU-09: rechaza otra reserva de la misma mesa 1 hora después',
    $q$INSERT INTO reservas (id, mesa_id, cliente_id, fecha_hora, personas)
       SELECT 9002, 9001, 9001, fecha_hora + interval '1 hour', 2
       FROM reservas WHERE id = 9001$q$, '23P01');
CALL pg_temp.debe_fallar('HU-09: rechaza otra reserva de la misma mesa 1 hora antes',
    $q$INSERT INTO reservas (id, mesa_id, cliente_id, fecha_hora, personas)
       SELECT 9002, 9001, 9001, fecha_hora - interval '1 hour 59 minutes', 2
       FROM reservas WHERE id = 9001$q$, '23P01');
CALL pg_temp.debe_funcionar('HU-09: permite la misma mesa 2 horas después',
    $q$INSERT INTO reservas (id, mesa_id, cliente_id, fecha_hora, personas)
       SELECT 9003, 9001, 9001, fecha_hora + interval '2 hours', 2
       FROM reservas WHERE id = 9001$q$);
CALL pg_temp.debe_funcionar('HU-09: permite otra mesa a la misma hora',
    $q$INSERT INTO mesas (id, numero, capacidad) VALUES (9010, 9010, 2);
       INSERT INTO reservas (id, mesa_id, cliente_id, fecha_hora, personas)
       SELECT 9004, 9010, 9001, fecha_hora, 2
       FROM reservas WHERE id = 9001$q$);
CALL pg_temp.debe_funcionar('HU-09: una reserva cancelada no bloquea la mesa',
    $q$INSERT INTO reservas (id, mesa_id, cliente_id, fecha_hora, personas, estado)
       SELECT 9005, 9001, 9001, fecha_hora, 2, 'CANCELADA'
       FROM reservas WHERE id = 9001$q$);
CALL pg_temp.debe_fallar('HU-09: rechaza reactivar una reserva que se cruza',
    $q$UPDATE reservas SET estado = 'PENDIENTE' WHERE id = 9005$q$, '23P01');
CALL pg_temp.debe_fallar('HU-09: rechaza más personas que la capacidad de la mesa',
    $q$INSERT INTO reservas (mesa_id, cliente_id, fecha_hora, personas)
       SELECT 9001, 9001, fecha_hora + interval '10 hours', 5
       FROM reservas WHERE id = 9001$q$, '23514');
CALL pg_temp.debe_fallar('HU-09: rechaza subir las personas por encima de la capacidad',
    $q$UPDATE reservas SET personas = 5 WHERE id = 9001$q$, '23514');
CALL pg_temp.debe_fallar('HU-09: rechaza bajar la capacidad por debajo de una reserva activa',
    $q$UPDATE mesas SET capacidad = 1 WHERE id = 9001$q$, '23514');
CALL pg_temp.debe_funcionar('HU-09: permite bajar la capacidad si las reservas caben',
    $q$UPDATE mesas SET capacidad = 3 WHERE id = 9001$q$);
CALL pg_temp.debe_funcionar('HU-09: limpiar reservas de prueba',
    $q$DELETE FROM reservas WHERE id IN (9003, 9004, 9005);
       DELETE FROM mesas WHERE id = 9010$q$);

-- Reglas al eliminar (RESTRICT y CASCADE).
CALL pg_temp.debe_fallar('RESTRICT: no borra producto ya vendido',
    $q$DELETE FROM productos WHERE id = 9001$q$, '23503');
CALL pg_temp.debe_fallar('RESTRICT: no borra cliente con reservas',
    $q$DELETE FROM clientes WHERE id = 9001$q$, '23503');
CALL pg_temp.debe_fallar('RESTRICT: no borra mesa con pedidos o reservas',
    $q$DELETE FROM mesas WHERE id = 9001$q$, '23503');
CALL pg_temp.debe_funcionar('CASCADE: borrar pedido borra sus líneas',
    $q$DELETE FROM pedidos WHERE id = 9001$q$);
INSERT INTO _resultado (prueba, ok)
SELECT 'CASCADE: no quedan líneas del pedido borrado',
       NOT EXISTS (SELECT 1 FROM detalle_pedido WHERE pedido_id = 9001);
CALL pg_temp.debe_funcionar('CASCADE: borrar mesa sin historial borra su layout',
    $q$DELETE FROM reservas WHERE id = 9001; DELETE FROM mesas WHERE id = 9001$q$);
INSERT INTO _resultado (prueba, ok)
SELECT 'CASCADE: no queda layout de la mesa borrada',
       NOT EXISTS (SELECT 1 FROM mesa_layout WHERE mesa_id = 9001);

SELECT n AS "#", CASE WHEN ok THEN 'OK' ELSE 'FALLA' END AS resultado, prueba
FROM _resultado ORDER BY n;

SELECT format('VERIFICACION %s: %s/%s pruebas superadas',
              CASE WHEN bool_and(ok) THEN 'COMPLETA' ELSE 'CON FALLAS' END,
              count(*) FILTER (WHERE ok), count(*)) AS resumen
FROM _resultado;

ROLLBACK;
\set QUIET off
