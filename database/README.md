# Base de datos

En esta carpeta está todo lo de la base de datos PostgreSQL del proyecto:

- `modelo-er.jpeg`: el diagrama entidad-relación.
- `diccionario-datos.md`: la explicación de cada tabla y columna, las relaciones, los estados y qué pasa al eliminar registros.
- `schema.sql`: el script que crea las tablas.
- `seed.sql`: los datos iniciales (configuración, mesas, plano y menú).
- `verify_schema.sql`: un script para revisar que el esquema quedó bien creado.

## Sobre el esquema

El backend no crea las tablas por su cuenta, así que la base se arma con estos scripts: primero `schema.sql` y después `seed.sql`. Los modelos del backend (`backend/app/models/`) usan las mismas tablas y columnas que define `schema.sql`.

`schema.sql` se basó en los modelos del proyecto anterior (`restaurante_software`) y produce exactamente el mismo esquema que generaba ese backend. Usa `IF NOT EXISTS`, entonces se puede correr varias veces sin que falle.

Si alguien cambia una tabla, toca actualizar también `schema.sql`, el diccionario de datos y los modelos del backend.

En el despliegue, PostgreSQL corre en un contenedor de Docker dentro de la máquina virtual de Azure. Los datos se guardan en un volumen, así que no se pierden cuando se reinician los contenedores.

## Datos iniciales

`seed.sql` carga lo mínimo para que el sistema funcione en una instalación nueva:

- La configuración de Trattoria Bellavista (una sola fila).
- 12 mesas, todas libres.
- La posición de las 12 mesas en el plano.
- 10 productos del menú (entradas, platos fuertes, bebidas y postres).

Clientes, reservas, pedidos y detalles de pedido empiezan vacíos, porque son datos de la operación diaria.

Se puede correr varias veces sin duplicar nada: cada dato se identifica por algo que no se repite (el número de la mesa, el nombre del producto, el id 1 de la configuración) y, si ya existe, no se vuelve a insertar.

## Conexión

La contraseña de la base no está en el repositorio. Cada uno copia el archivo de ejemplo (`backend/.env.example`) como `.env` y pone sus propios datos. El archivo `.env` no se sube a GitHub.

## Crear la base

### Con Docker (automático)

La imagen oficial de PostgreSQL ejecuta sola los scripts que encuentre en `/docker-entrypoint-initdb.d/`, en orden alfabético, la primera vez que arranca con un volumen vacío. Para que la base quede creada y con datos sin hacer nada a mano, el servicio de la base en `docker-compose.yml` debe montar los dos scripts así:

```yaml
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - restaurante_postgres:/var/lib/postgresql/data
      - ./database/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
      - ./database/seed.sql:/docker-entrypoint-initdb.d/02-seed.sql:ro
```

Con eso basta con:

```powershell
docker compose up -d
```

Hay que tener en cuenta que PostgreSQL solo ejecuta esos scripts cuando el volumen está vacío. Si la base ya existía, no los vuelve a correr. Para cargarlos sobre una base que ya existe:

```powershell
Get-Content database/schema.sql, database/seed.sql | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
```

### Con psql (sin Docker)

Sirve para crear las tablas en un PostgreSQL instalado aparte. Se necesita una base vacía y tener `psql` instalado. En PowerShell:

```powershell
$env:PGHOST="<servidor>"
$env:PGPORT="5432"
$env:PGDATABASE="restaurante_db"
$env:PGUSER="restaurante_app"
$env:PGPASSWORD="<contraseña>"

psql -v ON_ERROR_STOP=1 -f database/schema.sql -f database/seed.sql
```

Si no sale ningún `ERROR`, quedó bien. Si las tablas ya existían, salen avisos de `already exists, skipping`, pero eso no es un problema.

Para revisar que los datos quedaron cargados:

```sql
SELECT
  (SELECT count(*) FROM restaurante_config) AS configuracion,
  (SELECT count(*) FROM mesas)              AS mesas,
  (SELECT count(*) FROM mesa_layout)        AS plano,
  (SELECT count(*) FROM productos)          AS productos;
```

Debe dar 1, 12, 12 y 10.

## Verificar el esquema

```powershell
psql -f database/verify_schema.sql
```

O con Docker:

```powershell
Get-Content database/verify_schema.sql | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

En la máquina virtual de Azure es el mismo comando, pero en la terminal de Ubuntu, desde la carpeta del proyecto:

```bash
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < database/verify_schema.sql
```

El script muestra las tablas, las claves foráneas y los índices únicos, y después hace 37 pruebas. Por ejemplo, intenta guardar un producto con precio 0 o una mesa con un número repetido, y revisa que PostgreSQL lo rechace. También prueba que no se pueda borrar un producto que ya se vendió y que, al borrar un pedido, se borren sus detalles.

Las pruebas corren dentro de una transacción que se deshace al final, así que no dejan datos guardados ni tocan los datos iniciales. Si todo está bien, la última línea dice:

```
VERIFICACION COMPLETA: 37/37 pruebas superadas
```

## Pruebas que hicimos

Probamos todo en PostgreSQL 16:

- `schema.sql` en una base vacía: se crearon las 8 tablas sin errores. Al correrlo una segunda vez tampoco falló.
- `verify_schema.sql`: pasaron las 37 pruebas, tanto en una base vacía como en una con los datos iniciales.
- `schema.sql` + `seed.sql` en una base vacía: quedaron 1 configuración, 12 mesas, 12 posiciones y 10 productos, y las tablas de operación vacías.
- `seed.sql` corrido dos y tres veces seguidas: los conteos no cambiaron, no se duplicó nada.
- Comparamos `schema.sql` con lo que generaba el backend del proyecto anterior. Sacamos el SQL de sus modelos con SQLAlchemy 2.0.52, creamos una base con cada uno y comparamos las dos con `pg_dump --schema-only`. Salieron iguales.

Falta probar la carga automática dentro de Docker cuando el `docker-compose.yml` del proyecto esté listo.
