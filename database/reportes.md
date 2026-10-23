# Consultas para los reportes

Historia de usuario: HU-12 — Consultas, indicadores e integridad (issue #16).

Las consultas de los reportes están en `schema.sql` (secciones 18 a 23) como funciones y vistas de PostgreSQL. Así el backend no tiene que repetir la lógica: le basta con llamarlas. Por ejemplo:

```sql
SELECT * FROM fn_resumen_ventas('2026-10-01', '2026-10-31');
```

Las pruebas están en `verify_reportes.sql`.

## Reglas comunes

- **Una venta cuenta el día en que se pagó el pedido** (`closed_at`), no el día en que se abrió. Si una mesa abre a las 11 p. m. y paga a la 1 a. m., la venta es del día siguiente.
- **Solo cuentan los pedidos `PAGADO`.** Los cancelados se informan aparte y nunca suman a las ventas.
- **Las fechas se dan como días**, con `desde` y `hasta` incluidos. Para el reporte de un solo día se pone la misma fecha dos veces.
- **Los días se cuentan en la hora de Bogotá.** Un pedido pagado a las 11:50 p. m. cuenta ese día, aunque en UTC (la hora que guarda PostgreSQL) ya sea el día siguiente. Todas las funciones aceptan un tercer parámetro opcional para cambiar la zona horaria.

## Consultas disponibles

### Resumen de ventas

```sql
SELECT * FROM fn_resumen_ventas('2026-10-19', '2026-10-19');
```

| Columna | Qué es |
|---|---|
| `pedidos_pagados` | Cuántos pedidos se pagaron en el rango. |
| `ventas` | Suma de los totales de esos pedidos. |
| `ticket_promedio` | Promedio por pedido pagado (`ventas / pedidos_pagados`), redondeado a 2 decimales. Si no hubo ventas, es 0. |
| `pedidos_cancelados` | Cuántos pedidos se cancelaron en el rango. |

Sirve para los indicadores «ventas del día», «pedidos del día» y «ticket promedio» de la pantalla de reportes.

### Ranking de productos

```sql
SELECT * FROM fn_ranking_productos('2026-10-01', '2026-10-31');
```

Devuelve los productos vendidos en el rango con `unidades`, `ingresos` (suma de los subtotales) y en cuántos `pedidos` aparecieron. Se ordena por unidades; si dos productos venden lo mismo, gana el que más ingresos dejó.

Los ingresos salen del precio guardado en cada línea del pedido, no del precio actual del producto. Si un plato sube de precio, las ventas anteriores no cambian.

### Mesas más utilizadas

```sql
SELECT * FROM fn_mesas_mas_utilizadas('2026-10-01', '2026-10-31');
```

Cada mesa con la cantidad de pedidos pagados y lo que se vendió en ella. La primera fila es la «mesa más utilizada» de la pantalla de reportes.

### Reservas por estado

```sql
SELECT * FROM fn_reservas_por_estado('2026-10-19', '2026-10-19');
```

Cuántas reservas hay en cada estado y para cuántas personas, según el día de la reserva. Siempre devuelve los 6 estados, aunque alguno tenga 0, para que la pantalla no tenga que completar los que faltan.

### Mesas por estado

```sql
SELECT * FROM v_mesas_por_estado;
```

Cuántas mesas activas hay ahora mismo en cada estado (`LIBRE`, `RESERVADA`, `OCUPADA`, `FUERA_DE_SERVICIO`) y qué porcentaje representan. Las mesas desactivadas no cuentan. El porcentaje de `OCUPADA` es la ocupación actual del restaurante.

## Prueba con datos controlados

`verify_reportes.sql` carga unos datos inventados, cuyos resultados se saben de antemano, y revisa que cada consulta devuelva exactamente eso. Los datos usan fechas de enero de 2099 para no mezclarse con datos reales, y todo se deshace al final.

```powershell
psql -f database/verify_reportes.sql
```

Con Docker:

```powershell
Get-Content database/verify_reportes.sql | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

### Datos de prueba

Productos: Pasta (30.000), Vino (20.000) y Postre (10.000).

| Pedido | Mesa | Se pagó | Productos | Total |
|---|---|---|---|---|
| P1 | 9201 | 10 ene, 1:00 p. m. | 2 Pasta + 1 Vino | 80.000 |
| P2 | 9202 | 10 ene, 9:00 p. m. | 1 Pasta + 2 Postre | 50.000 |
| P3 | 9201 | 11 ene, 8:00 p. m. | 3 Vino | 60.000 |
| P4 | 9202 | Cancelado el 11 ene | 1 Pasta | no cuenta |
| P5 | 9201 | 12 ene, 11:50 p. m. | 1 Postre | 10.000 |

| Reserva | Mesa | Día | Estado | Personas |
|---|---|---|---|---|
| R1 | 9201 | 10 ene | CONFIRMADA | 4 |
| R2 | 9202 | 10 ene | PENDIENTE | 2 |
| R3 | 9201 | 11 ene | CANCELADA | 2 |
| R4 | 9201 | 11 ene | COMPLETADA | 3 |
| R5 | 9202 | 11 ene | NO_ASISTIO | 2 |
| R6 | 9201 | 12 ene | PENDIENTE | 2 |

Mesas: 9201 libre, 9202 reservada, 9203 fuera de servicio y 9204 ocupada pero desactivada.

### Resultados esperados

| Consulta | Resultado esperado |
|---|---|
| Ventas del 10 al 11 de enero | 3 pedidos pagados, 190.000 en ventas, ticket promedio 63.333,33, 1 cancelado |
| Ventas del 10 al 12 de enero | 4 pedidos pagados, 200.000, ticket promedio 50.000 |
| Ventas del 12 de enero | 1 pedido, 10.000 (el de las 11:50 p. m. cuenta ese día) |
| Ventas del 13 de enero | 0 pedidos, 0 en ventas, ticket 0 |
| Ranking del 10 al 11 de enero | 1. Vino: 4 unidades, 80.000 · 2. Pasta: 3 unidades, 90.000 · 3. Postre: 2 unidades, 20.000. La Pasta del pedido cancelado no cuenta. |
| Ranking contra ventas | La suma de los ingresos del ranking es igual a las ventas del periodo (190.000). |
| Mesas del 10 al 11 de enero | 1. Mesa 9201: 2 pedidos, 140.000 · 2. Mesa 9202: 1 pedido, 50.000 |
| Reservas del 10 al 11 de enero | Pendiente 1 (2 personas), Confirmada 1 (4), En mesa 0, Completada 1 (3), Cancelada 1 (2), No asistió 1 (2) |
| Reservas del 10 al 12 de enero | 6 en total |
| Mesas por estado | Las mesas de prueba suman 1 libre, 1 reservada y 1 fuera de servicio. La desactivada no cuenta. Los porcentajes suman 100. |

Resultado de la última ejecución: `VERIFICACION REPORTES COMPLETA: 13/13 pruebas superadas`.

## Índices

Revisamos qué filtros y uniones usan los reportes y qué índice los atiende:

| Consulta | Filtra o une por | Índice | Por qué |
|---|---|---|---|
| Ventas, ranking y mesas | Pedidos pagados en un rango de `closed_at` | `ix_pedidos_pagados_cierre` (nuevo) | Índice parcial: solo guarda los pedidos pagados, que son los únicos que suman, ordenados por fecha de pago. Así el reporte de un día no recorre todos los pedidos de la historia. |
| Ranking | Líneas de cada pedido | `ix_detalle_pedido_pedido_id` | Une cada pedido con sus líneas. |
| Ranking | Nombre de cada producto | `productos_pkey` | Une cada línea con su producto. |
| Mesas más utilizadas | Número de cada mesa | `mesas_pkey` | Une cada pedido con su mesa. |
| Reservas por estado | Reservas en un rango de `fecha_hora` | `ix_reservas_fecha_hora` | Encuentra las reservas de esos días sin recorrer toda la tabla. |
| Disponibilidad de una mesa (HU-09) | Mesa + fecha de reservas activas | `ix_reservas_mesa_fecha` | La consulta que hace el backend antes de reservar. |
| Mesas por estado | Estado de las mesas | Ninguno | Un restaurante tiene decenas de mesas, no miles. Leer la tabla completa es más rápido que usar un índice. |

Para comprobar que PostgreSQL de verdad usa los índices, cargamos 200.000 pedidos y 100.000 reservas de prueba y revisamos el plan de ejecución con `EXPLAIN ANALYZE`:

- Las ventas de un día usaron `ix_pedidos_pagados_cierre` y tardaron 0,2 ms.
- Las reservas de una semana usaron `ix_reservas_fecha_hora` y tardaron 0,3 ms.
- El resumen de ventas de un mes completo (unos 40.000 pedidos) tardó unos 20 ms.
