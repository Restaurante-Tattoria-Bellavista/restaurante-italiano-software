"""Ingreso facial con reto: retos de un solo uso, varias capturas, 1:1 y reglas del registro."""
import random

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, insert, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import rate_limit
from app.core.retos_faciales import POSES_RETO, AlmacenRetos
from app.db.session import get_db
from app.main import app
from app.models.catalogo import metadata
from app.models.usuarios import auditoria_accesos, usuarios
from app.routers import auth as auth_router
from app.services import auth_service
from app.services.auth_service import (
    DescriptorInvalido,
    hay_variacion_suficiente,
    identificar_con_capturas,
    rostro_ya_registrado,
    validar_coherencia_registro,
)

DIM = auth_service.DESCRIPTOR_LONGITUD


def rostro(semilla: int) -> list[float]:
    """Un 'rostro' base reproducible: personas distintas quedan muy lejos entre si."""
    return [random.Random(semilla).uniform(-1, 1) for _ in range(DIM)]


def captura(base: list[float], semilla: int, escala: float = 0.01) -> list[float]:
    """Un descriptor de esa misma persona con el ruido natural de un cuadro de camara."""
    azar = random.Random(semilla)
    return [v + azar.gauss(0, escala) for v in base]


ANA = rostro(1)
LUIS = rostro(2)


@pytest.fixture()
def cliente(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    metadata.create_all(engine, tables=[usuarios, auditoria_accesos])
    Sesion = sessionmaker(bind=engine, expire_on_commit=False)
    with Sesion() as db:
        db.execute(insert(usuarios), [
            {"username": "ana", "nombre": "Ana", "rol": "PERSONAL", "activo": True},
            {"username": "luis", "nombre": "Luis", "rol": "ADMIN", "activo": True},
        ])
        db.commit()

    # La columna de plantillas usa ARRAY de PostgreSQL: aqui se sustituye por datos en memoria.
    plantillas = {1: [captura(ANA, 10), captura(ANA, 11)], 2: [captura(LUIS, 20), captura(LUIS, 21)]}
    monkeypatch.setattr(auth_router, "_cargar_plantillas", lambda db, excluir_usuario=None: dict(plantillas))
    monkeypatch.setattr(auth_router, "_ids_con_rostro", lambda db: {1, 2})

    def override():
        db = Sesion()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override
    for limitador in (rate_limit.limitador_face_login, rate_limit.limitador_retos_faciales):
        limitador._fallos.clear()
    cli = TestClient(app)
    cli.sesion = Sesion
    yield cli
    app.dependency_overrides.clear()


def _reto(cli):
    r = cli.post("/api/auth/face-challenge")
    assert r.status_code == 200, r.text
    return r.json()


def _login(cli, base, semilla=100, username=None, reto=None, poses=None):
    reto = reto or _reto(cli)
    pedidas = poses or reto["poses"]
    capturas = [{"pose": p, "descriptor": captura(base, semilla + i)} for i, p in enumerate(pedidas)]
    cuerpo = {"challenge_id": reto["challenge_id"], "capturas": capturas}
    if username:
        cuerpo["username"] = username
    return cli.post("/api/auth/face-login", json=cuerpo)


def _auditoria(cli):
    with cli.sesion() as db:
        return [dict(f) for f in db.execute(select(auditoria_accesos).order_by(auditoria_accesos.c.id)).mappings()]


# ------------------------------------------------------------------ reto

def test_el_reto_trae_las_tres_poses_en_orden_aleatorio(cliente):
    visto = set()
    for _ in range(15):
        reto = _reto(cliente)
        assert sorted(reto["poses"]) == sorted(POSES_RETO)
        visto.add(tuple(reto["poses"]))
    assert len(visto) > 1, "el orden debe variar entre retos"


def test_el_reto_vence_y_solo_sirve_una_vez_y_para_su_origen():
    almacen = AlmacenRetos(ttl_segundos=60)
    reto_id, poses, _ = almacen.emitir("1.1.1.1")
    assert almacen.consumir(reto_id, "9.9.9.9") is None  # otro origen
    reto_id, poses, _ = almacen.emitir("1.1.1.1")
    assert almacen.consumir(reto_id, "1.1.1.1") == poses
    assert almacen.consumir(reto_id, "1.1.1.1") is None  # ya usado
    vencido = AlmacenRetos(ttl_segundos=0)
    reto_id, _, _ = vencido.emitir("1.1.1.1")
    assert vencido.consumir(reto_id, "1.1.1.1") is None


def test_el_almacen_no_crece_sin_limite():
    almacen = AlmacenRetos(ttl_segundos=60, maximo=5)
    for _ in range(50):
        almacen.emitir("x")
    assert len(almacen._retos) <= 5


# --------------------------------------------------------------- ingreso 1:N

def test_ingreso_correcto_sin_usuario(cliente):
    r = _login(cliente, ANA)
    assert r.status_code == 200, r.text
    assert r.json()["usuario"]["username"] == "ana" and r.json()["token"]
    ultima = _auditoria(cliente)[-1]
    assert ultima["exitoso"] is True and ultima["motivo"].startswith("OK d=")


def test_un_reto_no_se_puede_reutilizar(cliente):
    reto = _reto(cliente)
    assert _login(cliente, ANA, reto=reto).status_code == 200
    r = _login(cliente, ANA, reto=reto)
    assert r.status_code == 400
    assert _auditoria(cliente)[-1]["motivo"] == "RETO_INVALIDO"


def test_reto_inventado_se_rechaza(cliente):
    cuerpo = {"challenge_id": "x" * 32, "capturas": [{"pose": "FRENTE", "descriptor": ANA}]}
    assert cliente.post("/api/auth/face-login", json=cuerpo).status_code == 400


def test_las_capturas_deben_seguir_el_orden_del_reto(cliente):
    reto = _reto(cliente)
    desordenadas = list(reversed(reto["poses"]))
    r = _login(cliente, ANA, reto=reto, poses=desordenadas)
    assert r.status_code == 422
    assert _auditoria(cliente)[-1]["motivo"] == "RETO_INCORRECTO"


def test_capturas_identicas_se_rechazan_como_repeticion(cliente):
    reto = _reto(cliente)
    igual = captura(ANA, 5)
    capturas = [{"pose": p, "descriptor": igual} for p in reto["poses"]]
    r = cliente.post("/api/auth/face-login", json={"challenge_id": reto["challenge_id"], "capturas": capturas})
    assert r.status_code == 401
    assert _auditoria(cliente)[-1]["motivo"] == "CAPTURAS_SIN_VARIACION"


def test_rostro_desconocido_se_rechaza_y_se_audita_la_distancia(cliente):
    r = _login(cliente, rostro(99))
    assert r.status_code == 401
    assert "ROSTRO_NO_RECONOCIDO d=" in _auditoria(cliente)[-1]["motivo"]


def test_una_sola_captura_mala_no_pasa_aunque_las_demas_sean_buenas(cliente):
    reto = _reto(cliente)
    capturas = [
        {"pose": reto["poses"][0], "descriptor": captura(ANA, 1)},
        {"pose": reto["poses"][1], "descriptor": captura(ANA, 2)},
        {"pose": reto["poses"][2], "descriptor": rostro(77)},
    ]
    r = cliente.post("/api/auth/face-login", json={"challenge_id": reto["challenge_id"], "capturas": capturas})
    assert r.status_code == 401


def test_el_formato_antiguo_con_un_solo_descriptor_ya_no_entra(cliente):
    assert cliente.post("/api/auth/face-login", json={"descriptor": ANA}).status_code == 422


def test_limite_de_fallos_por_ip(cliente):
    for _ in range(10):
        _login(cliente, rostro(99))
    assert _login(cliente, ANA).status_code == 429


# --------------------------------------------------------------- ingreso 1:1

def test_ingreso_1_a_1_correcto(cliente):
    r = _login(cliente, LUIS, username="Luis")
    assert r.status_code == 200 and r.json()["usuario"]["username"] == "luis"


def test_ingreso_1_a_1_con_el_rostro_de_otro_falla(cliente):
    r = _login(cliente, ANA, username="luis")
    assert r.status_code == 401


def test_ingreso_1_a_1_con_usuario_inexistente_falla(cliente):
    assert _login(cliente, ANA, username="nadie").status_code == 401


def test_ingreso_1_a_1_bloquea_la_cuenta_tras_5_fallos(cliente):
    for _ in range(5):
        assert _login(cliente, ANA, username="luis").status_code == 401
    r = _login(cliente, LUIS, username="luis")  # ya ni con su propio rostro
    assert r.status_code == 423


# ------------------------------------------------------------ reglas del servicio

def test_identificar_usa_la_mediana_y_no_un_solo_cuadro():
    plantillas = {"ana": [ANA]}
    buenas = [captura(ANA, i) for i in range(3)]
    assert identificar_con_capturas(buenas, plantillas, umbral=0.55)[0] == "ana"


def test_identificar_rechaza_ambiguedad_en_1_a_n_pero_no_en_1_a_1():
    gemelo = captura(ANA, 3, escala=0.0005)
    plantillas = {"a": [ANA], "b": [gemelo]}
    descriptores = [captura(ANA, 7), captura(ANA, 8)]
    assert identificar_con_capturas(descriptores, plantillas, umbral=0.55)[0] is None
    assert identificar_con_capturas(descriptores, plantillas, umbral=0.55, solo_usuario="a")[0] == "a"


def test_variacion_minima_entre_capturas():
    a = captura(ANA, 1)
    assert hay_variacion_suficiente([a, captura(ANA, 2)], 0.08) is True
    assert hay_variacion_suficiente([a, list(a)], 0.08) is False


def test_registro_incoherente_se_rechaza():
    mezcla = [("FRENTE", ANA), ("IZQUIERDA", captura(ANA, 1)), ("DERECHA", LUIS)]
    with pytest.raises(DescriptorInvalido):
        validar_coherencia_registro(mezcla)
    validar_coherencia_registro([("FRENTE", ANA), ("IZQUIERDA", captura(ANA, 1)), ("DERECHA", captura(ANA, 2))])


def test_rostro_ya_registrado_en_otra_cuenta():
    existentes = {7: [ANA]}
    assert rostro_ya_registrado([captura(ANA, 1)], existentes) == 7
    assert rostro_ya_registrado([LUIS], existentes) is None
