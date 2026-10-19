from app.routers.reservas import router as reservas_router
from fastapi import FastAPI
from starlette.exceptions import HTTPException
from fastapi.exceptions import RequestValidationError
from app.core.config import get_settings
from app.core.errors import (
    BusinessError,
    business_exception_handler,
    http_exception_handler,
    validation_exception_handler,
)
from app.routers.health import router as health_router
from app.routers.catalogo import router as catalogo_router


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0", description="API REST modular para Trattoria Bellavista")
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(BusinessError, business_exception_handler)
    app.include_router(health_router)
    app.include_router(reservas_router)
    app.include_router(catalogo_router)
    return app


app = create_app()
