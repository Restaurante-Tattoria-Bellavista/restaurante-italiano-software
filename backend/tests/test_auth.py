import time

import pytest

from app.core.security import create_token, decode_token, hash_password, verify_password
from app.services.auth_service import (
    DESCRIPTOR_LONGITUD,
    DescriptorInvalido,
    buscar_usuario,
    distancia,
    validar_descriptor,
    validar_plantillas,
)


def test_hash_y_verificacion_de_contrasena():
    h = hash_password("clave-segura-123")
    assert h != "clave-segura-123"
    assert verify_password("clave-segura-123", h) is True
    assert verify_password("otra-clave", h) is False


def test_verify_password_rechaza_hash_nulo_o_malformado():
    assert verify_password("x", None) is False
    assert verify_password("x", "no-es-un-hash") is False


def test_token_ida_y_vuelta_y_firma_invalida():
    token = create_token(7, "ADMIN", "secreto-prueba", 60)
    claims = decode_token(token, "secreto-prueba")
    assert claims["sub"] == 7 and claims["rol"] == "ADMIN"
    assert decode_token(token, "otro-secreto") is None
    assert decode_token("basura", "secreto-prueba") is None


def test_token_expirado():
    token = create_token(1, "PERSONAL", "s", -1)
    assert decode_token(token, "s") is None


def _vector(valor: float) -> list[float]:
    return [valor] * DESCRIPTOR_LONGITUD


def test_validar_descriptor_longitud_y_valores():
    assert len(validar_descriptor(_vector(0.1))) == DESCRIPTOR_LONGITUD
    with pytest.raises(DescriptorInvalido):
        validar_descriptor([0.1, 0.2])
    with pytest.raises(DescriptorInvalido):
        validar_descriptor(_vector(float("nan")))
    with pytest.raises(DescriptorInvalido):
        validar_descriptor(["a"] * DESCRIPTOR_LONGITUD)


def test_buscar_usuario_acepta_rostro_cercano():
    ana = _vector(0.0)
    luis = _vector(1.0)
    descriptor = [v + 0.001 for v in ana]
    assert buscar_usuario(descriptor, {"ana": [ana], "luis": [luis]}) == "ana"


def test_buscar_usuario_rechaza_rostro_lejano():
    descriptor = _vector(0.5)
    assert distancia(descriptor, _vector(0.0)) > 0.55
    assert buscar_usuario(descriptor, {"ana": [_vector(0.0)]}) is None


def test_buscar_usuario_rechaza_ambiguedad():
    base = _vector(0.0)
    casi_igual = [v + 0.0001 for v in base]
    assert buscar_usuario(base, {"a": [base], "b": [casi_igual]}) is None


def test_buscar_usuario_sin_candidatos():
    assert buscar_usuario(_vector(0.0), {}) is None


def test_buscar_usuario_usa_la_plantilla_mas_parecida():
    # Una persona registrada de frente y de perfil: la de perfil debe bastar para reconocerla.
    frente = _vector(0.0)
    perfil = _vector(0.3)
    lejano = _vector(1.0)
    descriptor_actual = [v + 0.001 for v in perfil]  # cercano a la de perfil, lejos de la de frente
    assert distancia(descriptor_actual, frente) > 0.55
    assert buscar_usuario(descriptor_actual, {"ana": [frente, perfil], "luis": [lejano]}) == "ana"


def test_validar_plantillas_exige_poses_unicas_y_minimas():
    tres = [("FRENTE", _vector(0.0)), ("IZQUIERDA", _vector(0.1)), ("DERECHA", _vector(0.2))]
    assert len(validar_plantillas(tres)) == 3
    with pytest.raises(DescriptorInvalido):
        validar_plantillas(tres[:2])
    with pytest.raises(DescriptorInvalido):
        validar_plantillas(tres + [("FRENTE", _vector(0.3))])
