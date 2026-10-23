# Base de datos

En esta carpeta está todo lo de la base de datos PostgreSQL del proyecto:

- `modelo-er.jpeg`: el diagrama entidad-relación.
- `diccionario-datos.md`: la explicación de cada tabla y columna, las relaciones, los estados y qué pasa al eliminar registros.
- `schema.sql`: el script que crea las tablas.
- `verify_schema.sql`: un script para revisar que el esquema quedó bien creado.

## Sobre el esquema

El backend ya crea las tablas solo cuando arranca (`init_db.py` usa `Base.metadata.create_all()` con los modelos de `backend/app/models/`). Aun así, hicimos `schema.sql` para tener el esquema en SQL: así se puede leer sin abrir el código Python, crear las tablas en cualquier PostgreSQL sin levantar el backend, y cumplir con el script de creación que pide la guía.

En el despliegue, PostgreSQL corre en un contenedor de Docker dentro de la máquina virtual de Azure, junto con el backend y el frontend. Los datos se guardan en el volumen `restaurante_postgres`, así que no se pierden cuando se reinician los contenedores.

El script crea las mismas 8 tablas que el backend, con los mismos tipos, restricciones e índices. Usa `IF NOT EXISTS`, entonces no importa el orden: si las tablas ya existen, no las vuelve a crear.

Si alguien cambia un modelo del backend, toca actualizar también `schema.sql` y el diccionario de datos.

## Conexión

La contraseña de la base no está en el repositorio. La conexión se configura con estas variables de entorno:

```
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
```

Cada uno copia `.env.example` como `.env` y pone su propia contraseña. El archivo `.env` está en el `.gitignore`, así que no se sube. Docker Compose lee ese archivo y le pasa las variables a PostgreSQL y al backend, que las carga en `backend/app/config/settings.py`. `DB_PASSWORD` no tiene valor por defecto, entonces si falta, el backend no arranca.

Pendiente: en el `.env.example` de la raíz quedó una contraseña de ejemplo (`bellavista_local_2026`). Hay que cambiarla por algo como `CAMBIAR_PASSWORD`, igual que en `backend/.env.example`.

## Crear la base

### Con Docker

```powershell
Copy-Item .env.example .env   # luego cambiar DB_PASSWORD en el .env
docker compose up -d --build
```

Con esto el backend crea las tablas y carga los datos iniciales. Si además se quiere correr `schema.sql`:

```powershell
Get-Content database/schema.sql | docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
```

Así funciona tanto en el computador como en la máquina virtual de Azure.

### Con psql (sin Docker)

Sirve para crear las tablas en un PostgreSQL instalado aparte, sin usar Docker. Se necesita una base vacía y tener `psql` instalado. En PowerShell:

```powershell
$env:PGHOST="<servidor>"
$env:PGPORT="5432"
$env:PGDATABASE="restaurante_db"
$env:PGUSER="restaurante_app"
$env:PGPASSWORD="<contraseña>"

psql -v ON_ERROR_STOP=1 -f database/schema.sql
```

Si no sale ningún `ERROR`, quedó bien. Si las tablas ya existían, salen avisos de `already exists, skipping`, pero eso no es un problema.

## Verificar

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

Las pruebas corren dentro de una transacción que se deshace al final, así que no dejan datos guardados. Si todo está bien, la última línea dice:

```
VERIFICACION COMPLETA: 37/37 pruebas superadas
```

## Pruebas que hicimos

Probamos todo en PostgreSQL 16:

- `schema.sql` en una base vacía: se crearon las 8 tablas sin errores. Al correrlo una segunda vez tampoco falló.
- `verify_schema.sql`: pasaron las 37 pruebas.
- Comparamos `schema.sql` con lo que genera el backend. Sacamos el SQL de los modelos con SQLAlchemy 2.0.52 (la versión del proyecto), creamos una base con cada uno y comparamos las dos con `pg_dump --schema-only`. Salieron iguales. Si alguien quiere repetir la comparación:

```bash
pg_dump --schema-only --no-owner base_backend > backend.sql
pg_dump --schema-only --no-owner base_script  > script.sql
diff backend.sql script.sql
```
