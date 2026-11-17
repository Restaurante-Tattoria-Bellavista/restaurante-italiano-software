"""Utilidades de seguridad: hash de contrasenas y tokens de sesion firmados.

Usa solo la libreria estandar de Python para no agregar dependencias.
"""
import base64
import hashlib
import hmac
import json
import os
import time

PBKDF2_ITERATIONS = 310_000
ALGORITMO_HASH = "pbkdf2_sha256"


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"{ALGORITMO_HASH}${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored_hash: str | None) -> bool:
    if not stored_hash:
        return False
    try:
        algoritmo, iteraciones, salt_hex, digest_hex = stored_hash.split("$")
        if algoritmo != ALGORITMO_HASH:
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iteraciones),
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


# Hash ficticio para igualar el tiempo de respuesta cuando el usuario no existe.
HASH_FICTICIO = hash_password("contrasena-ficticia-no-utilizable")


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def create_token(usuario_id: int, rol: str, secret: str, ttl_seconds: int) -> str:
    payload = {"sub": usuario_id, "rol": rol, "exp": int(time.time()) + ttl_seconds}
    cuerpo = _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    firma = hmac.new(secret.encode("utf-8"), cuerpo.encode("ascii"), hashlib.sha256).digest()
    return f"{cuerpo}.{_b64encode(firma)}"


def decode_token(token: str, secret: str) -> dict | None:
    try:
        cuerpo, firma_recibida = token.split(".")
        firma_esperada = hmac.new(secret.encode("utf-8"), cuerpo.encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(_b64encode(firma_esperada), firma_recibida):
            return None
        payload = json.loads(_b64decode(cuerpo))
        if int(payload.get("exp", 0)) < time.time():
            return None
        return payload
    except (ValueError, TypeError, json.JSONDecodeError):
        return None
