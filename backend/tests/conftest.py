"""Fixtures compartidas: app FastAPI sobre SQLite en memoria (sin Docker ni Postgres)."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, insert
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.main import app
from app.models.catalogo import metadata, mesas, productos
from app.models.operacion import detalle_pedido, pedidos, voz_sesiones

TABLAS = [mesas, productos, pedidos, detalle_pedido, voz_sesiones]

# El id es la posicion (1..N): las pruebas los usan directamente.
MENU = [
    ("Bruschetta al Pomodoro", "ENTRADA", 16000),
    ("Burrata Bellavista", "ENTRADA", 24000),
    ("Pizza Margherita", "PLATO_FUERTE", 30000),
    ("Lasagna della Casa", "PLATO_FUERTE", 34000),
    ("Risotto ai Funghi", "PLATO_FUERTE", 36000),
    ("Spaghetti alla Carbonara", "PLATO_FUERTE", 33000),
    ("Limonata della Casa", "BEBIDA", 9000),
    ("Espresso", "BEBIDA", 6000),
    ("Tiramisu", "POSTRE", 18000),
    ("Panna Cotta", "POSTRE", 16000),
]


def _montar_app(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    metadata.create_all(engine, tables=TABLAS)
    Sesion = sessionmaker(bind=engine, expire_on_commit=False)

    with Sesion() as db:
        db.execute(insert(mesas), [{"numero": n, "capacidad": 4, "estado": "LIBRE", "activo": True} for n in range(1, 13)])
        db.execute(insert(productos), [
            {"nombre": n, "categoria": c, "precio": p, "disponible": True} for n, c, p in MENU])
        db.commit()

    def override():
        db = Sesion()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "rol": "ADMIN", "activo": True}
    return TestClient(app)


@pytest.fixture()
def api(monkeypatch):
    """Cliente HTTP con mesas y menu sembrados, sesion simulada y Gemini desactivado (pruebas offline)."""
    cfg = get_settings()
    monkeypatch.setattr(cfg, "gemini_api_key", None)
    monkeypatch.setattr(cfg, "voz_device_key", "")
    yield _montar_app(monkeypatch)
    app.dependency_overrides.clear()


@pytest.fixture()
def api_live(monkeypatch):
    """Igual, pero conserva la GEMINI_API_KEY real de backend/.env. Se omite si no hay clave."""
    if not get_settings().gemini_api_key:
        pytest.skip("No hay GEMINI_API_KEY en backend/.env")
    yield _montar_app(monkeypatch)
    app.dependency_overrides.clear()
