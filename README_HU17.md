# HU-17 — Dockerización completa

El archivo `docker/postgres/01-schema.sql` se obtiene desde `database/schema.sql` de la rama `origin/feature/HU-08-esquema-postgresql` (HU-08, Fernando) durante la instalación. **Este ZIP no contiene ese archivo**. Si HU-08 cambia, hay que sincronizarlo.

## Configuración
1. Instalar Docker Desktop con motor Linux y Compose V2.
2. Copiar `.env.docker.example` a `.env` en la raíz. Cambiar POSTGRES_PASSWORD a una contraseña alfanumérica propia (sin espacios ni caracteres reservados de URL) y no publicarla.
3. Generar `docker/postgres/01-schema.sql` directamente desde Git (PowerShell en la raíz): `cmd /c "git show origin/feature/HU-08-esquema-postgresql:database/schema.sql > docker\postgres\01-schema.sql"`. Verificar que exista y no esté vacío.
4. Desde la raíz ejecutar `docker compose config -q` y `docker compose up -d --build`.
5. Abrir `http://localhost:8080/` y comprobar `http://localhost:8080/health/db`.
6. Verificar `docker compose ps`, `docker compose logs --tail=50 backend`.

No ejecutar `docker compose down -v` salvo que se quiera destruir deliberadamente la base de datos persistente. El esquema PostgreSQL de `docker/postgres/01-schema.sql` solo se aplica al crear un volumen vacío; no migra bases existentes.

Se publica solamente el puerto HTTP del frontend. Nginx enruta `/api`, `/health`, `/docs`, `/redoc` y `/openapi.json` al backend. PostgreSQL permanece en la red interna de Compose.

Limitación: esta configuración es para ejecución local o laboratorio; no incluye TLS ni secretos gestionados para despliegue público.
