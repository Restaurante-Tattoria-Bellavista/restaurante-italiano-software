-- =====================================================================
-- Trattoria Bellavista — Datos semilla
-- Historia de usuario: HU-11 — Inicialización automática y datos semilla (issue #15)
--
-- Carga los datos iniciales que necesita el sistema para funcionar:
--   - 1 configuración del restaurante
--   - 12 mesas
--   - 12 posiciones de mesas en el plano
--   - 10 productos del menú
--
-- Clientes, reservas, pedidos y detalles de pedido empiezan vacíos.
--
-- Se puede ejecutar varias veces: si un dato ya existe, no se vuelve a
-- insertar (ON CONFLICT DO NOTHING). Requiere haber ejecutado antes
-- database/schema.sql.
--
-- Uso:
--   psql -v ON_ERROR_STOP=1 -f database/schema.sql -f database/seed.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Configuración del restaurante (una sola fila, id = 1)
-- ---------------------------------------------------------------------
INSERT INTO restaurante_config (id, nombre, especialidad, moneda, ciudad)
VALUES (1, 'Trattoria Bellavista', 'Cucina Italiana', 'COP', 'Bogota')
ON CONFLICT (id) DO NOTHING;

-- Como el id se insertó a mano, se ajusta el contador para que un
-- INSERT posterior sin id no intente usar el 1 otra vez.
SELECT setval(
    pg_get_serial_sequence('restaurante_config', 'id'),
    (SELECT MAX(id) FROM restaurante_config)
);

-- ---------------------------------------------------------------------
-- 2. Mesas (se identifican por su número, que es único)
-- ---------------------------------------------------------------------
INSERT INTO mesas (numero, capacidad, ubicacion, estado, activo)
VALUES
    (1,  4, 'Salon principal',  'LIBRE', true),
    (2,  4, 'Salon principal',  'LIBRE', true),
    (3,  4, 'Salon principal',  'LIBRE', true),
    (4,  4, 'Salon principal',  'LIBRE', true),
    (5,  4, 'Terraza',          'LIBRE', true),
    (6,  4, 'Terraza',          'LIBRE', true),
    (7,  4, 'Salon principal',  'LIBRE', true),
    (8,  4, 'Salon principal',  'LIBRE', true),
    (9,  6, 'Salon principal',  'LIBRE', true),
    (10, 6, 'Salon principal',  'LIBRE', true),
    (11, 6, 'Sala privada VIP', 'LIBRE', true),
    (12, 6, 'Sala privada VIP', 'LIBRE', true)
ON CONFLICT (numero) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Posición de cada mesa en el plano
--    Se busca el id de la mesa por su número, porque el id lo asigna
--    PostgreSQL y puede cambiar entre instalaciones.
-- ---------------------------------------------------------------------
INSERT INTO mesa_layout (mesa_id, zona, pos_x, pos_y, forma)
SELECT m.id, p.zona, p.pos_x, p.pos_y, p.forma
FROM (
    VALUES
        (1,  'SALON',   28, 28, 'RECT'),
        (2,  'SALON',   41, 28, 'RECT'),
        (3,  'SALON',   55, 27, 'ROUND'),
        (4,  'SALON',   68, 27, 'ROUND'),
        (5,  'TERRAZA',  9, 25, 'ROUND'),
        (6,  'TERRAZA',  9, 67, 'ROUND'),
        (7,  'SALON',   28, 61, 'RECT'),
        (8,  'SALON',   41, 61, 'RECT'),
        (9,  'SALON',   55, 61, 'ROUND'),
        (10, 'SALON',   68, 61, 'RECT'),
        (11, 'VIP',     93, 66, 'SMALL'),
        (12, 'VIP',     93, 28, 'SMALL')
) AS p (numero, zona, pos_x, pos_y, forma)
JOIN mesas m ON m.numero = p.numero AND m.activo
ON CONFLICT (mesa_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. Productos del menú (se identifican por su nombre, que es único)
-- ---------------------------------------------------------------------
INSERT INTO productos (nombre, descripcion, precio, categoria, disponible)
VALUES
    ('Bruschetta al Pomodoro', 'Pan artesanal tostado, tomate fresco, albahaca y aceite de oliva.', 16000, 'ENTRADA',      true),
    ('Burrata Bellavista',     'Burrata cremosa, tomates, pesto de albahaca y focaccia.',            24000, 'ENTRADA',      true),
    ('Pizza Margherita',       'Tomate San Marzano, mozzarella y albahaca.',                         30000, 'PLATO_FUERTE', true),
    ('Lasagna della Casa',     'Lasagna horneada con ragu, bechamel y parmesano.',                   34000, 'PLATO_FUERTE', true),
    ('Risotto ai Funghi',      'Arroz arborio, hongos, parmesano y mantequilla.',                    36000, 'PLATO_FUERTE', true),
    ('Spaghetti Carbonara',    'Pasta, huevo, queso, pimienta y panceta.',                           32000, 'PLATO_FUERTE', true),
    ('Limonata della Casa',    'Limonada italiana con hierbabuena.',                                  9000, 'BEBIDA',       true),
    ('Espresso Italiano',      'Cafe espresso de tueste intenso.',                                    6000, 'BEBIDA',       true),
    ('Tiramisu',               'Clasico italiano de cafe, mascarpone y cacao.',                      16000, 'POSTRE',       true),
    ('Panna Cotta',            'Panna cotta de vainilla con salsa de frutos rojos.',                 15000, 'POSTRE',       true)
ON CONFLICT (nombre) DO NOTHING;

COMMIT;
