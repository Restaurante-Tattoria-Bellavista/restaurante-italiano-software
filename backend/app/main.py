import asyncio
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from starlette.exceptions import HTTPException
from fastapi.exceptions import RequestValidationError
from app.core.config import get_settings
from app.core.dependencies import get_current_user
from app.core.metricas import medir_peticiones
from app.core.metricas import router as metricas_router
from app.core.errors import (
    BusinessError,
    business_exception_handler,
    http_exception_handler,
    validation_exception_handler,
)
from app.routers.auth import router as auth_router
from app.routers.auth import usuarios_router
from app.routers.operacion import router as operacion_router
from app.routers.reservas import router as reservas_router
from app.routers.health import router as health_router
from app.routers.catalogo import router as catalogo_router
from app.routers.tiempo_real import router as tiempo_real_router
from app.routers.ubicaciones import router as ubicaciones_router
from app.routers.voz import router as voz_router
from app.routers.voz import router_dispositivo as voz_dispositivo_router
from app.core.realtime import hub
import app.db.eventos  # noqa: F401  registra los listeners de escritura

# Todas las rutas de negocio exigen una sesion valida. Health y autenticacion son publicas.
proteccion = [Depends(get_current_user)]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    hub.registrar_loop(asyncio.get_running_loop())
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0", description="API REST modular para Trattoria Bellavista", lifespan=lifespan)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(BusinessError, business_exception_handler)
    # Cuenta las peticiones y mide cuánto tarda cada una (ver app/core/metricas.py).
    app.middleware("http")(medir_peticiones)
    app.include_router(health_router)
    app.include_router(metricas_router)
    app.include_router(auth_router)
    app.include_router(tiempo_real_router)
    app.include_router(ubicaciones_router)
    app.include_router(usuarios_router, dependencies=proteccion)
    app.include_router(operacion_router, dependencies=proteccion)
    app.include_router(reservas_router, dependencies=proteccion)
    app.include_router(catalogo_router, dependencies=proteccion)
    app.include_router(voz_router, dependencies=proteccion)
    app.include_router(voz_dispositivo_router)  # se autentica con X-Device-Key
    return app


app = create_app()
