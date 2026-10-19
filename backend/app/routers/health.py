from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from app.core.config import get_settings
from app.db.session import get_engine
from app.schemas.health import HealthResponse, DatabaseHealthResponse

router = APIRouter(tags=["Salud"])


@router.get("/health", response_model=HealthResponse, summary="Salud de la aplicacion")
def health():
    return HealthResponse(status="ok", service=get_settings().app_name)


@router.get(
    "/health/db",
    response_model=DatabaseHealthResponse,
    responses={503: {"description": "PostgreSQL no disponible"}},
    summary="Verifica la conectividad a PostgreSQL",
)
def database_health():
    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
        return DatabaseHealthResponse(status="ok", database="postgresql")
    except Exception:
        # No exponer host, usuario, contrasena o errores del driver al cliente.
        return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content={"error": {"code": "database_unavailable", "message": "PostgreSQL no disponible", "details": []}})
