# HU-13 | Arquitectura modular FastAPI

Issue: https://github.com/Restaurante-Tattoria-Bellavista/restaurante-italiano-software/issues/5

## Requisitos
Python 3.11+, PostgreSQL para probar `/health/db`.

## Ejecutar en Windows PowerShell
Desde la carpeta `backend`:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
# Editar .env con los datos de PostgreSQL local (nunca publicar credenciales).
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Comprobaciones: `http://127.0.0.1:8000/health`, `http://127.0.0.1:8000/health/db`, `http://127.0.0.1:8000/docs`, `http://127.0.0.1:8000/openapi.json`.

Tests, desde `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Si PostgreSQL no esta disponible, `/health/db` responde HTTP 503 sin filtrar informacion sensible. No hay tablas ni migraciones en HU-13: se integran con las HU de base de datos.

## Capas
- `core`: configuracion y formato coherente de errores
- `db`: motor y sesiones SQLAlchemy
- `models`: modelos ORM (se definiran al integrar la base)
- `schemas`: contratos Pydantic
- `repositories`: consultas persistentes
- `services`: logica de negocio
- `routers`: endpoints HTTP

## Flujo Git
Crear una rama `feature/HU-13-arquitectura-fastapi` desde `dev`, enviar PR a `dev` y solicitar aprobacion. El PR debe referenciar `HU-13` y `#5`.
