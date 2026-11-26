"""Solicitudes de acceso: registro desde el ingreso y aprobacion o rechazo por un administrador."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, insert, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import rate_limit
from app.core.dependencies import get_current_user
from app.core.security import hash_password
from app.db.session import get_db
from app.main import app
from app.models.catalogo import metadata
from app.models.usuarios import auditoria_accesos, solicitudes_acceso, usuarios
from app.routers import auth as auth_router
from app.routers import solicitudes as solicitudes_router

CLAVE = "clave-segura-123"
NUEVO = {"nombre": "Laura Mesera", "username": "laura", "password": CLAVE}
ADMIN = {"id": 1, "username": "admin", "rol": "ADMIN", "activo": True}
PERSONAL = {"id": 2, "username": "pedro", "rol": "PERSONAL", "activo": True}


@pytest.fixture()
def cliente(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    metadata.create_all(engine, tables=[usuarios, auditoria_accesos, solicitudes_acceso])
    Sesion = sessionmaker(bind=engine, expire_on_commit=False)
    with Sesion() as db:
        db.execute(insert(usuarios), [
            {"username": "admin", "nombre": "Admin", "rol": "ADMIN", "activo": True, "password_hash": hash_password(CLAVE)},
            {"username": "pedro", "nombre": "Pedro", "rol": "PERSONAL", "activo": True, "password_hash": hash_password(CLAVE)},
        ])
        db.commit()

    def override():
        db = Sesion()
        try:
            yield db
        finally:
            db.close()

    # La tabla de rostros usa ARRAY de PostgreSQL: aqui se sustituye la consulta.
    monkeypatch.setattr(auth_router, "_ids_con_rostro", lambda db: set())

    quien = {"usuario": ADMIN}
    app.dependency_overrides[get_db] = override
    app.dependency_overrides[get_current_user] = lambda: quien["usuario"]
    for limitador in (rate_limit.limitador_registro, rate_limit.limitador_login):
        limitador._fallos.clear()
    cli = TestClient(app)
    cli.sesion = Sesion
    cli.quien = quien
    yield cli
    app.dependency_overrides.clear()


def _solicitar(cli, **cambios):
    return cli.post("/api/auth/registro", json={**NUEVO, **cambios})


def _login(cli, username, password):
    return cli.post("/api/auth/login", json={"username": username, "password": password})


def _filas(cli, tabla):
    with cli.sesion() as db:
        return [dict(f) for f in db.execute(select(tabla)).mappings()]


def _id_pendiente(cli):
    return next(f["id"] for f in _filas(cli, solicitudes_acceso) if f["estado"] == "PENDIENTE")


# ----------------------------------------------------------------- solicitar

def test_registro_crea_una_solicitud_pendiente_sin_guardar_la_clave(cliente):
    r = _solicitar(cliente)
    assert r.status_code == 202 and "aprobarla" in r.json()["mensaje"]
    fila = _filas(cliente, solicitudes_acceso)[0]
    assert fila["estado"] == "PENDIENTE" and fila["username"] == "laura"
    assert CLAVE not in fila["password_hash"] and fila["password_hash"]
    assert [a["motivo"] for a in _filas(cliente, auditoria_accesos)] == ["SOLICITUD_CREADA"]


def test_registro_no_crea_el_usuario_todavia(cliente):
    _solicitar(cliente)
    assert all(u["username"] != "laura" for u in _filas(cliente, usuarios))
    assert _login(cliente, "laura", CLAVE).status_code == 403


def test_registro_normaliza_el_usuario(cliente):
    assert _solicitar(cliente, username="  Laura  ").status_code == 202
    assert _filas(cliente, solicitudes_acceso)[0]["username"] == "laura"


def test_registro_valida_los_datos(cliente):
    assert _solicitar(cliente, password="corta").status_code == 422
    assert _solicitar(cliente, username="con espacios").status_code == 422
    assert _solicitar(cliente, username="ab").status_code == 422
    assert _solicitar(cliente, nombre="x").status_code == 422
    assert _filas(cliente, solicitudes_acceso) == []


def test_registro_rechaza_usuarios_existentes_y_solicitudes_duplicadas(cliente):
    assert _solicitar(cliente, username="admin").status_code == 409
    assert _solicitar(cliente).status_code == 202
    assert _solicitar(cliente).status_code == 409


def test_registro_tiene_limite_por_ip(cliente):
    for i in range(5):
        assert _solicitar(cliente, username=f"persona{i}").status_code == 202
    assert _solicitar(cliente, username="persona5").status_code == 429


def test_registro_tiene_tope_de_pendientes(cliente, monkeypatch):
    monkeypatch.setattr(solicitudes_router, "MAX_PENDIENTES", 2)
    assert _solicitar(cliente, username="uno1").status_code == 202
    assert _solicitar(cliente, username="dos2").status_code == 202
    assert _solicitar(cliente, username="tres").status_code == 503


# ------------------------------------------------------------------ permisos

def test_solo_un_administrador_gestiona_las_solicitudes(cliente):
    _solicitar(cliente)
    sid = _id_pendiente(cliente)
    cliente.quien["usuario"] = PERSONAL
    assert cliente.get("/api/solicitudes").status_code == 403
    assert cliente.post(f"/api/solicitudes/{sid}/aprobar").status_code == 403
    assert cliente.post(f"/api/solicitudes/{sid}/rechazar").status_code == 403
    assert _filas(cliente, solicitudes_acceso)[0]["estado"] == "PENDIENTE"


def test_sin_sesion_no_se_puede_gestionar():
    app.dependency_overrides.clear()
    app.dependency_overrides[get_db] = lambda: iter([None])  # sin credenciales se rechaza antes de usar la base
    try:
        assert TestClient(app).get("/api/solicitudes").status_code == 401
    finally:
        app.dependency_overrides.clear()


def test_el_listado_no_expone_hashes_ni_ips(cliente):
    _solicitar(cliente)
    lista = cliente.get("/api/solicitudes").json()
    assert len(lista) == 1 and lista[0]["username"] == "laura" and lista[0]["estado"] == "PENDIENTE"
    assert "password_hash" not in lista[0] and "ip" not in lista[0]
    assert cliente.get("/api/solicitudes?estado=APROBADA").json() == []
    assert cliente.get("/api/solicitudes?estado=TODAS").status_code == 200


# --------------------------------------------------------------------- aprobar

def test_aprobar_crea_el_usuario_que_puede_iniciar_sesion(cliente):
    _solicitar(cliente)
    sid = _id_pendiente(cliente)
    r = cliente.post(f"/api/solicitudes/{sid}/aprobar")
    assert r.status_code == 200 and r.json()["username"] == "laura" and r.json()["rol"] == "PERSONAL"
    sesion = _login(cliente, "laura", CLAVE)
    assert sesion.status_code == 200 and sesion.json()["token"]
    fila = _filas(cliente, solicitudes_acceso)[0]
    assert fila["estado"] == "APROBADA" and fila["resuelta_por"] == "admin" and fila["password_hash"] == ""


def test_aprobar_permite_elegir_el_rol(cliente):
    _solicitar(cliente)
    r = cliente.post(f"/api/solicitudes/{_id_pendiente(cliente)}/aprobar", json={"rol": "ADMIN"})
    assert r.status_code == 200 and r.json()["rol"] == "ADMIN"
    assert cliente.post("/api/solicitudes/1/aprobar", json={"rol": "SUPERUSUARIO"}).status_code == 422


def test_una_solicitud_no_se_resuelve_dos_veces(cliente):
    _solicitar(cliente)
    sid = _id_pendiente(cliente)
    assert cliente.post(f"/api/solicitudes/{sid}/aprobar").status_code == 200
    assert cliente.post(f"/api/solicitudes/{sid}/aprobar").status_code == 409
    assert cliente.post(f"/api/solicitudes/{sid}/rechazar").status_code == 409


def test_aprobar_una_solicitud_inexistente(cliente):
    assert cliente.post("/api/solicitudes/999/aprobar").status_code == 404
    assert cliente.post("/api/solicitudes/999/rechazar").status_code == 404


def test_aprobar_falla_si_el_usuario_se_creo_mientras_tanto(cliente):
    _solicitar(cliente)
    with cliente.sesion() as db:
        db.execute(insert(usuarios).values(username="laura", nombre="Otra", rol="PERSONAL", activo=True))
        db.commit()
    r = cliente.post(f"/api/solicitudes/{_id_pendiente(cliente)}/aprobar")
    assert r.status_code == 409
    assert _filas(cliente, solicitudes_acceso)[0]["estado"] == "PENDIENTE"


# -------------------------------------------------------------------- rechazar

def test_rechazar_guarda_el_motivo_y_no_crea_usuario(cliente):
    _solicitar(cliente)
    r = cliente.post(f"/api/solicitudes/{_id_pendiente(cliente)}/rechazar", json={"motivo": "No trabaja aquí"})
    assert r.status_code == 200 and r.json()["estado"] == "RECHAZADA" and r.json()["motivo"] == "No trabaja aquí"
    assert all(u["username"] != "laura" for u in _filas(cliente, usuarios))


def test_rechazar_sin_cuerpo_tambien_funciona(cliente):
    _solicitar(cliente)
    assert cliente.post(f"/api/solicitudes/{_id_pendiente(cliente)}/rechazar").status_code == 200


def test_quien_fue_rechazado_puede_volver_a_solicitar(cliente):
    _solicitar(cliente)
    cliente.post(f"/api/solicitudes/{_id_pendiente(cliente)}/rechazar")
    assert _solicitar(cliente).status_code == 202


# ----------------------------------------------------------- mensajes al ingresar

def test_login_explica_que_la_solicitud_esta_pendiente(cliente):
    _solicitar(cliente)
    r = _login(cliente, "laura", CLAVE)
    assert r.status_code == 403 and "pendiente" in r.json()["error"]["message"]


def test_login_explica_que_la_solicitud_fue_rechazada(cliente):
    _solicitar(cliente)
    cliente.post(f"/api/solicitudes/{_id_pendiente(cliente)}/rechazar")
    r = _login(cliente, "laura", CLAVE)
    assert r.status_code == 403 and "rechazada" in r.json()["error"]["message"]


def test_login_no_revela_solicitudes_sin_la_contrasena_correcta(cliente):
    _solicitar(cliente)
    r = _login(cliente, "laura", "otra-clave-cualquiera")
    assert r.status_code == 401
    assert _login(cliente, "inexistente", CLAVE).status_code == 401
