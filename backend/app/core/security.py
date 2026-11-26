"""Utilidades de seguridad: hash de contrasenas (PBKDF2, libreria estandar) y tokens de sesion JWT (PyJWT)."""
import hashlib
import hmac
import os
import secrets
import time

import jwt

PBKDF2_ITERATIONS = 310_000
ALGORITMO_HASH = "pbkdf2_sha256"
ALGORITMO_JWT = "HS256"
EMISOR_JWT = "trattoria-bellavista"


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


def create_token(usuario_id: int, rol: str, secret: str, ttl_seconds: int) -> str:
    """JWT firmado con HS256 (RFC 7519): header.payload.firma, decodificable en jwt.io.

    Claims: sub (id del usuario, como texto segun el RFC), rol, iss (emisor), iat, exp y jti (id unico del token).
    """
    ahora = int(time.time())
    payload = {
        "sub": str(usuario_id),
        "rol": rol,
        "iss": EMISOR_JWT,
        "iat": ahora,
        "exp": ahora + ttl_seconds,
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(payload, secret, algorithm=ALGORITMO_JWT)


def decode_token(token: str, secret: str) -> dict | None:
    """Devuelve los claims si el token es valido y vigente; None en cualquier otro caso.

    Se fija el algoritmo (HS256) para que un token con "alg": "none" u otro algoritmo no se acepte, y se exigen
    exp, sub e iss: un token sin vencimiento no es valido.
    """
    try:
        return jwt.decode(
            token,
            secret,
            algorithms=[ALGORITMO_JWT],
            issuer=EMISOR_JWT,
            options={"require": ["exp", "sub", "iss"]},
        )
    except jwt.PyJWTError:
        return None
