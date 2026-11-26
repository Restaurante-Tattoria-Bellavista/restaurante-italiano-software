"""Autenticacion JWT: formato del token, ataques conocidos, arranque en produccion y permisos por rol."""
import base64
import json
import time

import jwt
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, insert, update
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.core.dependencies import get_current_user
from app.core.security import EMISOR_JWT, create_token, decode_token
from app.db.session import get_db
from app.main import app
from app.models.catalogo import metadata
from app.models.usuarios import usuarios
from app.routers import auth as auth_router

SECRETO = "una-llave-de-prueba-de-al-menos-32-caracteres"


def _b64(datos: dict) -> str:
    crudo = json.dumps(datos, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(crudo).rstrip(b"=").decode()


# ----------------------------------------------------------------- formato del token

def test_el_token_es_un_jwt_estandar_decodificable():
    token = create_token(7, "ADMIN", SECRETO, 60)
    assert token.count(".") == 2, "un JWT son tres partes: header.payload.firma"
    assert jwt.get_unverified_header(token) == {"alg": "HS256", "typ": "JWT"}
    claims = jwt.decode(token, SECRETO, algorithms=["HS256"], issuer=EMISOR_JWT)
    assert claims["sub"] == "7" and claims["rol"] == "ADMIN" and claims["iss"] == EMISOR_JWT
    assert claims["exp"] - claims["iat"] == 60 and claims["jti"]


def test_cada_token_tiene_un_identificador_distinto():
    assert create_token(1, "ADMIN", SECRETO, 60) != create_token(1, "ADMIN", SECRETO, 60)


# --------------------------------------------------------------- ataques conocidos

def test_token_alterado_o_con_otra_llave_se_rechaza():
    token = create_token(2, "PERSONAL", SECRETO, 60)
    cabecera, cuerpo, firma = token.split(".")
    # Cambiar el rol dentro del payload sin volver a firmar.
    falso = _b64({**json.loads(base64.urlsafe_b64decode(cuerpo + "==")), "rol": "ADMIN"})
    assert decode_token(f"{cabecera}.{falso}.{firma}", SECRETO) is None
    assert decode_token(token, "otra-llave-distinta-de-32-caracteres-o-mas") is None


def test_token_con_algoritmo_none_se_rechaza():
    sin_firma = f"{_b64({'alg': 'none', 'typ': 'JWT'})}.{_b64({'sub': '1', 'rol': 'ADMIN', 'iss': EMISOR_JWT, 'exp': int(time.time()) + 600})}."
    assert decode_token(sin_firma, SECRETO) is None


def test_token_firmado_con_otro_algoritmo_se_rechaza():
    token = jwt.encode(
        {"sub": "1", "rol": "ADMIN", "iss": EMISOR_JWT, "exp": int(time.time()) + 600}, SECRETO, algorithm="HS512"
    )
    assert decode_token(token, SECRETO) is None


def test_token_vencido_o_sin_vencimiento_se_rechaza():
    assert decode_token(create_token(1, "ADMIN", SECRETO, -5), SECRETO) is None
    sin_exp = jwt.encode({"sub": "1", "rol": "ADMIN", "iss": EMISOR_JWT}, SECRETO, algorithm="HS256")
    assert decode_token(sin_exp, SECRETO) is None


def test_token_de_otro_emisor_se_rechaza():
    ajeno = jwt.encode({"sub": "1", "iss": "otra-app", "exp": int(time.time()) + 600}, SECRETO, algorithm="HS256")
    assert decode_token(ajeno, SECRETO) is None


@pytest.mark.parametrize("basura", ["", "abc", "a.b", "a.b.c", "....", "Bearer x.y.z"])
def test_basura_nunca_lanza_excepcion(basura):
    assert decode_token(basura, SECRETO) is None


# ------------------------------------------------------ arranque en produccion (Secret)

def _produccion(monkeypatch, **valores):
    monkeypatch.delenv("AUTH_SECRET", raising=False)
    return Settings(_env_file=None, environment="production", database_url="x", **valores)


def test_en_produccion_auth_secret_es_obligatorio(monkeypatch):
    with pytest.raises(ValidationError, match="AUTH_SECRET es obligatorio"):
        _produccion(monkeypatch)


@pytest.mark.parametrize("debil", ["corta", "CAMBIAR_AUTH_SECRET", "CAMBIAR" + "x" * 40])
def test_en_produccion_se_rechaza_una_llave_debil_o_de_ejemplo(monkeypatch, debil):
    with pytest.raises(ValidationError, match="AUTH_SECRET"):
        _produccion(monkeypatch, auth_secret=debil)


def test_el_error_de_arranque_no_filtra_valores_de_la_configuracion(monkeypatch):
    with pytest.raises(ValidationError) as error:
        _produccion(monkeypatch, auth_secret="corta", gateway_token="TOKEN-QUE-NO-DEBE-SALIR")
    assert "TOKEN-QUE-NO-DEBE-SALIR" not in str(error.value)


def test_en_produccion_una_llave_fuerte_arranca(monkeypatch):
    assert _produccion(monkeypatch, auth_secret=SECRETO).auth_secret == SECRETO


def test_en_desarrollo_se_genera_una_llave_si_falta(monkeypatch):
    monkeypatch.delenv("AUTH_SECRET", raising=False)
    config = Settings(_env_file=None, environment="development", database_url="x")
    assert len(config.auth_secret) >= 32


# ---------------------------------------------------------- permisos por ruta y por rol

# Unicas rutas sin token de usuario. Cada una usa otra credencial o es publica por diseno.
PUBLICAS = {
    ("GET", "/health"): "comprobacion de salud",
    ("GET", "/health/db"): "comprobacion de salud",
    ("POST", "/api/auth/login"): "ingreso",
    ("POST", "/api/auth/face-challenge"): "ingreso facial",
    ("POST", "/api/auth/face-login"): "ingreso facial",
    ("POST", "/api/auth/registro"): "solicitud de cuenta (la aprueba un admin)",
    ("POST", "/api/ubicaciones/lecturas"): "gateway BLE con X-Gateway-Token",
    ("POST", "/api/v1/voz/audio"): "terminal ESP32 con X-Device-Key",
    ("POST", "/api/v1/voz/latido"): "terminal ESP32 con X-Device-Key",
}


def test_toda_ruta_exige_sesion_salvo_las_publicas_conocidas():
    """Si alguien agrega una ruta sin proteccion, esta prueba falla y obliga a decidirlo a proposito."""
    sin_proteccion = {
        (metodo.upper(), ruta)
        for ruta, operaciones in app.openapi()["paths"].items()
        for metodo, operacion in operaciones.items()
        if not operacion.get("security")
    }
    assert sin_proteccion == set(PUBLICAS), (
        f"rutas sin sesion no previstas: {sin_proteccion - set(PUBLICAS)}; "
        f"previstas que ya no existen o ahora se protegen: {set(PUBLICAS) - sin_proteccion}"
    )


@pytest.fixture()
def con_base(monkeypatch):
    from app.core.config import get_settings

    cfg = get_settings()
    monkeypatch.setattr(cfg, "auth_secret", SECRETO)
    # La tabla de rostros usa ARRAY de PostgreSQL: aqui se sustituye la consulta.
    monkeypatch.setattr(auth_router, "_ids_con_rostro", lambda db: set())
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    metadata.create_all(engine, tables=[usuarios])
    Sesion = sessionmaker(bind=engine, expire_on_commit=False)
    with Sesion() as db:
        db.execute(insert(usuarios), [
            {"username": "ana", "nombre": "Ana", "rol": "ADMIN", "activo": True},
            {"username": "pedro", "nombre": "Pedro", "rol": "PERSONAL", "activo": True},
        ])
        db.commit()

    def override():
        db = Sesion()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    cliente = TestClient(app)
    cliente.sesion = Sesion
    yield cliente
    app.dependency_overrides.clear()


def _con(token):
    return {"Authorization": f"Bearer {token}"}


def test_sin_token_o_con_token_invalido_es_401(con_base):
    assert con_base.get("/api/auth/me").status_code == 401
    assert con_base.get("/api/auth/me", headers=_con("basura")).status_code == 401
    assert con_base.get("/api/auth/me", headers=_con(create_token(1, "ADMIN", "otra" * 12, 60))).status_code == 401
    assert con_base.post("/api/v1/productos", json={}).status_code == 401


def test_token_valido_da_acceso_y_devuelve_el_usuario(con_base):
    r = con_base.get("/api/auth/me", headers=_con(create_token(1, "ADMIN", SECRETO, 60)))
    assert r.status_code == 200 and r.json()["username"] == "ana"


def test_un_usuario_desactivado_pierde_el_acceso_aunque_su_token_siga_vigente(con_base):
    token = create_token(2, "PERSONAL", SECRETO, 3600)
    assert con_base.get("/api/auth/me", headers=_con(token)).status_code == 200
    with con_base.sesion() as db:
        db.execute(update(usuarios).where(usuarios.c.id == 2).values(activo=False))
        db.commit()
    assert con_base.get("/api/auth/me", headers=_con(token)).status_code == 401


def test_el_rol_del_token_no_da_privilegios_si_la_base_dice_otra_cosa(con_base):
    """Un token que afirme ser ADMIN pero sea de un usuario PERSONAL no abre rutas de administrador."""
    falso_admin = create_token(2, "ADMIN", SECRETO, 60)  # el usuario 2 es PERSONAL en la base
    assert con_base.get("/api/usuarios", headers=_con(falso_admin)).status_code == 403


# Escrituras reservadas al administrador (el resto de la operacion es para todo el personal).
SOLO_ADMIN = [
    ("POST", "/api/v1/productos", {"nombre": "X", "precio": 1000, "categoria": "ENTRADA"}),
    ("PATCH", "/api/v1/productos/1", {"precio": 2000}),
    ("POST", "/api/v1/mesas", {"numero": 99, "capacidad": 4}),
    ("PUT", "/api/v1/mesas/1/layout", {"zona": "SALON", "pos_x": 10, "pos_y": 10, "forma": "ROUND"}),
    ("PATCH", "/api/v1/configuracion", {"nombre": "Otro nombre"}),
    ("POST", "/api/usuarios", {"username": "nuevo", "nombre": "Nuevo", "rol": "PERSONAL", "password": "clave-segura-1"}),
]


@pytest.mark.parametrize("metodo,ruta,cuerpo", SOLO_ADMIN)
def test_el_personal_no_puede_hacer_escrituras_de_administrador(con_base, metodo, ruta, cuerpo):
    r = con_base.request(metodo, ruta, json=cuerpo, headers=_con(create_token(2, "PERSONAL", SECRETO, 60)))
    assert r.status_code == 403, r.text
    assert r.json()["error"]["message"] == "Esta accion requiere rol de administrador."


@pytest.mark.parametrize("metodo,ruta,cuerpo", SOLO_ADMIN)
def test_el_administrador_si_pasa_el_control_de_rol(con_base, metodo, ruta, cuerpo):
    """No importa si luego falla por datos o por la base: lo que se comprueba es que no sea 401 ni 403."""
    try:
        r = con_base.request(metodo, ruta, json=cuerpo, headers=_con(create_token(1, "ADMIN", SECRETO, 60)))
    except Exception:  # la base de esta prueba solo tiene la tabla de usuarios
        return
    assert r.status_code not in (401, 403), r.text


def test_el_personal_si_puede_leer(con_base):
    r = con_base.get("/api/auth/me", headers=_con(create_token(2, "PERSONAL", SECRETO, 60)))
    assert r.status_code == 200 and r.json()["rol"] == "PERSONAL"
