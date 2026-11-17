-- =====================================================================
-- Trattoria Bellavista — Verificación de los reportes
-- Historia de usuario: HU-12 — Consultas, indicadores e integridad (issue #16)
--
-- Carga un conjunto de datos controlado, cuyos resultados se conocen de
-- antemano, y compara lo que devuelven las consultas de los reportes con
-- esos valores esperados.
--
-- Los datos de prueba usan fechas de enero de 2099, para no mezclarse con
-- datos reales, y todo se deshace al final (ROLLBACK). Se puede ejecutar
-- sobre una base con datos reales sin modificarla.
--
-- Requiere haber ejecutado antes database/schema.sql.
--
-- Uso:
--   psql -f database/verify_reportes.sql
--
-- Resultado esperado: la última línea dice
-- "VERIFICACION REPORTES COMPLETA: n/n pruebas superadas".
-- Los datos y los resultados esperados están explicados en
-- database/reportes.md.
-- =====================================================================

\set ON_ERROR_STOP on
\pset footer off
\set QUIET on

BEGIN;

CREATE TEMP TABLE _resultado (n serial, prueba text, ok boolean);

-- Mesas de estado actual antes de cargar los datos de prueba, para medir
-- solo el cambio que producen las mesas de prueba.
CREATE TEMP TABLE _mesas_antes AS SELECT estado, mesas FROM v_mesas_por_estado;

-- ---------------------------------------------------------------------
-- Datos de prueba
-- ---------------------------------------------------------------------
SET LOCAL TIME ZONE 'America/Bogota';

INSERT INTO productos (id, nombre, precio, categoria) VALUES
    (9201, 'Prueba Pasta',  30000, 'PLATO_FUERTE'),
    (9202, 'Prueba Vino',   20000, 'BEBIDA'),
    (9203, 'Prueba Postre', 10000, 'POSTRE');

INSERT INTO mesas (id, numero, capacidad, estado, activo) VALUES
    (9201, 9201, 4, 'LIBRE',             true),
    (9202, 9202, 2, 'RESERVADA',         true),
    (9203, 9203, 4, 'FUERA_DE_SERVICIO', true),
    (9204, 9204, 4, 'OCUPADA',           false);  -- inactiva: no cuenta

INSERT INTO clientes (id, nombre) VALUES (9201, 'Cliente Prueba Reportes');

-- Pedidos: se abren, se les agregan productos y luego se cierran, igual
-- que hace el backend.
--
--   P1  mesa 9201  pagado 10 ene 13:00  2 Pasta + 1 Vino  = 80000
--   P2  mesa 9202  pagado 10 ene 21:00  1 Pasta + 2 Postre = 50000
--   P3  mesa 9201  pagado 11 ene 20:00  3 Vino            = 60000
--   P4  mesa 9202  cancelado 11 ene     1 Pasta           = no cuenta
--   P5  mesa 9201  pagado 12 ene 23:50  1 Postre          = 10000
--       (en UTC ya es 13 de enero; debe contar el 12)

INSERT INTO pedidos (id, mesa_id, created_at) VALUES (9201, 9201, '2099-01-10 12:00');
INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES
    (9201, 9201, 2, 30000, 60000),
    (9201, 9202, 1, 20000, 20000);
UPDATE pedidos SET estado = 'PAGADO', closed_at = '2099-01-10 13:00' WHERE id = 9201;

INSERT INTO pedidos (id, mesa_id, created_at) VALUES (9202, 9202, '2099-01-10 20:00');
INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES
    (9202, 9201, 1, 30000, 30000),
    (9202, 9203, 2, 10000, 20000);
UPDATE pedidos SET estado = 'PAGADO', closed_at = '2099-01-10 21:00' WHERE id = 9202;

INSERT INTO pedidos (id, mesa_id, created_at) VALUES (9203, 9201, '2099-01-11 19:00');
INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES
    (9203, 9202, 3, 20000, 60000);
UPDATE pedidos SET estado = 'PAGADO', closed_at = '2099-01-11 20:00' WHERE id = 9203;

INSERT INTO pedidos (id, mesa_id, created_at) VALUES (9204, 9202, '2099-01-11 12:00');
INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES
    (9204, 9201, 1, 30000, 30000);
UPDATE pedidos SET estado = 'CANCELADO', closed_at = '2099-01-11 12:30' WHERE id = 9204;

INSERT INTO pedidos (id, mesa_id, created_at) VALUES (9205, 9201, '2099-01-12 23:30');
INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES
    (9205, 9203, 1, 10000, 10000);
UPDATE pedidos SET estado = 'PAGADO', closed_at = '2099-01-12 23:50' WHERE id = 9205;

-- Reservas:
--   R1  mesa 9201  10 ene 19:00  CONFIRMADA  4 personas
--   R2  mesa 9202  10 ene 19:00  PENDIENTE   2 personas
--   R3  mesa 9201  11 ene 12:00  CANCELADA   2 personas
--   R4  mesa 9201  11 ene 20:00  COMPLETADA  3 personas
--   R5  mesa 9202  11 ene 20:00  NO_ASISTIO  2 personas
--   R6  mesa 9201  12 ene 19:00  PENDIENTE   2 personas (fuera del rango 10-11)
INSERT INTO reservas (mesa_id, cliente_id, fecha_hora, personas, estado) VALUES
    (9201, 9201, '2099-01-10 19:00', 4, 'CONFIRMADA'),
    (9202, 9201, '2099-01-10 19:00', 2, 'PENDIENTE'),
    (9201, 9201, '2099-01-11 12:00', 2, 'CANCELADA'),
    (9201, 9201, '2099-01-11 20:00', 3, 'COMPLETADA'),
    (9202, 9201, '2099-01-11 20:00', 2, 'NO_ASISTIO'),
    (9201, 9201, '2099-01-12 19:00', 2, 'PENDIENTE');

-- ---------------------------------------------------------------------
-- 1. Resumen de ventas
-- ---------------------------------------------------------------------
INSERT INTO _resultado (prueba, ok)
SELECT 'Ventas 10-11 ene: 3 pagados, 190000, ticket 63333.33, 1 cancelado',
       (pedidos_pagados, ventas, ticket_promedio, pedidos_cancelados)
     = (3::bigint, 190000.00::numeric, 63333.33::numeric, 1::bigint)
FROM fn_resumen_ventas('2099-01-10', '2099-01-11');

INSERT INTO _resultado (prueba, ok)
SELECT 'Ventas 10-12 ene: 4 pagados, 200000, ticket 50000',
       (pedidos_pagados, ventas, ticket_promedio) = (4::bigint, 200000.00::numeric, 50000.00::numeric)
FROM fn_resumen_ventas('2099-01-10', '2099-01-12');

INSERT INTO _resultado (prueba, ok)
SELECT 'Ventas 12 ene: el pedido de las 11:50 p. m. cuenta ese día (10000)',
       (pedidos_pagados, ventas) = (1::bigint, 10000.00::numeric)
FROM fn_resumen_ventas('2099-01-12', '2099-01-12');

INSERT INTO _resultado (prueba, ok)
SELECT 'Ventas 13 ene: no hay ventas (0, 0, ticket 0)',
       (pedidos_pagados, ventas, ticket_promedio) = (0::bigint, 0.00::numeric, 0.00::numeric)
FROM fn_resumen_ventas('2099-01-13', '2099-01-13');

-- ---------------------------------------------------------------------
-- 2. Ranking de productos (10-11 ene; el pedido cancelado no cuenta)
--    1. Vino   4 unidades  80000
--    2. Pasta  3 unidades  90000
--    3. Postre 2 unidades  20000
-- ---------------------------------------------------------------------
INSERT INTO _resultado (prueba, ok)
SELECT 'Ranking 10-11 ene: Vino (4, 80000), Pasta (3, 90000), Postre (2, 20000)',
       array_agg(nombre || ':' || unidades || ':' || ingresos ORDER BY posicion)
     = ARRAY['Prueba Vino:4:80000.00', 'Prueba Pasta:3:90000.00', 'Prueba Postre:2:20000.00']
FROM fn_ranking_productos('2099-01-10', '2099-01-11');

INSERT INTO _resultado (prueba, ok)
SELECT 'Ranking: la suma de ingresos es igual a las ventas del periodo',
       (SELECT sum(ingresos) FROM fn_ranking_productos('2099-01-10', '2099-01-11'))
     = (SELECT ventas FROM fn_resumen_ventas('2099-01-10', '2099-01-11'));

-- ---------------------------------------------------------------------
-- 3. Mesas más utilizadas (10-11 ene)
--    1. Mesa 9201  2 pedidos  140000
--    2. Mesa 9202  1 pedido    50000
-- ---------------------------------------------------------------------
INSERT INTO _resultado (prueba, ok)
SELECT 'Mesas 10-11 ene: 9201 (2 pedidos, 140000), 9202 (1, 50000)',
       array_agg(mesa_numero || ':' || pedidos || ':' || ventas ORDER BY posicion)
     = ARRAY['9201:2:140000.00', '9202:1:50000.00']
FROM fn_mesas_mas_utilizadas('2099-01-10', '2099-01-11');

-- ---------------------------------------------------------------------
-- 4. Reservas por estado (10-11 ene; R6 queda fuera)
-- ---------------------------------------------------------------------
INSERT INTO _resultado (prueba, ok)
SELECT 'Reservas 10-11 ene por estado (siempre los 6 estados)',
       array_agg(estado || ':' || reservas || ':' || personas ORDER BY orden)
     = ARRAY['PENDIENTE:1:2', 'CONFIRMADA:1:4', 'EN_MESA:0:0',
             'COMPLETADA:1:3', 'CANCELADA:1:2', 'NO_ASISTIO:1:2']
FROM fn_reservas_por_estado('2099-01-10', '2099-01-11')
     WITH ORDINALITY AS t (estado, reservas, personas, orden);

INSERT INTO _resultado (prueba, ok)
SELECT 'Reservas 10-12 ene: 6 reservas en total',
       sum(reservas) = 6
FROM fn_reservas_por_estado('2099-01-10', '2099-01-12');

-- ---------------------------------------------------------------------
-- 5. Mesas por estado: las mesas de prueba suman 1 libre, 1 reservada y
--    1 fuera de servicio. La mesa inactiva no cuenta.
-- ---------------------------------------------------------------------
INSERT INTO _resultado (prueba, ok)
SELECT 'Mesas por estado: suma 1 LIBRE, 1 RESERVADA, 0 OCUPADA, 1 FUERA_DE_SERVICIO',
       array_agg(d.estado || ':' || (d.mesas - a.mesas) ORDER BY d.estado)
     = ARRAY['FUERA_DE_SERVICIO:1', 'LIBRE:1', 'OCUPADA:0', 'RESERVADA:1']
FROM v_mesas_por_estado d
JOIN _mesas_antes a ON a.estado = d.estado;

INSERT INTO _resultado (prueba, ok)
SELECT 'Mesas por estado: los porcentajes suman 100',
       round(sum(porcentaje)) = 100
FROM v_mesas_por_estado;

-- ---------------------------------------------------------------------
-- 6. Los reportes usan los índices pensados para ellos
-- ---------------------------------------------------------------------
INSERT INTO _resultado (prueba, ok)
SELECT 'Existe el índice de ventas por fecha de pago (ix_pedidos_pagados_cierre)',
       EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_pedidos_pagados_cierre');

INSERT INTO _resultado (prueba, ok)
SELECT 'Existe el índice de reservas por fecha (ix_reservas_fecha_hora)',
       EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ix_reservas_fecha_hora');

-- ---------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------
\set QUIET off
SELECT n AS "#", CASE WHEN ok THEN 'OK' ELSE 'FALLA' END AS resultado, prueba
FROM _resultado ORDER BY n;

SELECT format('VERIFICACION REPORTES %s: %s/%s pruebas superadas',
              CASE WHEN bool_and(ok) THEN 'COMPLETA' ELSE 'CON FALLAS' END,
              count(*) FILTER (WHERE ok), count(*)) AS resumen
FROM _resultado;

\set QUIET on
ROLLBACK;
\set QUIET off
