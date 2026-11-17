
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException

from app.core.config import get_settings
from app.core.errors import (
    BusinessError,
    business_exception_handler,
    http_exception_handler,
    validation_exception_handler,
)

from app.routers.health import router as health_router
from app.routers.catalogo import router as catalogo_router
from app.routers.reservas import router as reservas_router
from app.routers.operacion import router as operacion_router


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="API REST modular para Trattoria Bellavista",
    )

    # Manejadores de excepciones
    app.add_exception_handler(
        HTTPException,
        http_exception_handler,
    )
    app.add_exception_handler(
        RequestValidationError,
        validation_exception_handler,
    )
    app.add_exception_handler(
        BusinessError,
        business_exception_handler,
    )

    # Registro de rutas
    app.include_router(health_router)
    app.include_router(catalogo_router)
    app.include_router(reservas_router)
    app.include_router(operacion_router)

    return app


app = create_app()
