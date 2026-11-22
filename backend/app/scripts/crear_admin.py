"""Crea el primer usuario administrador.

Uso (con Docker):
    docker compose exec -e ADMIN_USERNAME=admin -e ADMIN_NOMBRE="Gerente" backend python -m app.scripts.crear_admin

Si ADMIN_PASSWORD no se define y hay una terminal interactiva, la contrasena se pide sin mostrarla.
No se guarda ninguna credencial en el codigo.
"""
import getpass
import os
import sys

from sqlalchemy import insert, select
from sqlalchemy.exc import IntegrityError

from app.core.security import hash_password
from app.db.session import get_engine
from app.models.usuarios import ROL_ADMIN, usuarios


def main() -> int:
    username = (os.environ.get("ADMIN_USERNAME") or input("Usuario administrador: ")).strip().lower()
    nombre = os.environ.get("ADMIN_NOMBRE") or username
    password = os.environ.get("ADMIN_PASSWORD")
    if not password:
        if not sys.stdin.isatty():
            print("Define ADMIN_PASSWORD o ejecuta el script en una terminal interactiva.", file=sys.stderr)
            return 1
        password = getpass.getpass("Contrasena (minimo 8 caracteres): ")
    if len(password) < 8:
        print("La contrasena debe tener al menos 8 caracteres.", file=sys.stderr)
        return 1

    with get_engine().begin() as conexion:
        if conexion.execute(select(usuarios.c.id).where(usuarios.c.username == username)).first():
            print(f"El usuario '{username}' ya existe. No se modifico.", file=sys.stderr)
            return 1
        try:
            conexion.execute(insert(usuarios).values(
                username=username,
                nombre=nombre,
                rol=ROL_ADMIN,
                password_hash=hash_password(password),
                activo=True,
            ))
        except IntegrityError:
            print("No fue posible crear el usuario.", file=sys.stderr)
            return 1

    print(f"Administrador '{username}' creado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
