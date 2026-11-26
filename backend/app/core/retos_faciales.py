"""Retos de un solo uso para el ingreso facial.

El servidor decide que poses debe hacer la persona y en que orden. Quien intente reenviar capturas
antiguas (o una foto de una sola pose) no sabe de antemano la secuencia, y un reto ya usado o vencido
se rechaza. Vive en memoria: igual que el limitador de intentos, sirve para un solo proceso de uvicorn.
"""
import random
import secrets
import threading
import time

# Poses que puede pedir un reto. ARRIBA/ABAJO quedan fuera: su deteccion en el navegador es poco estable.
POSES_RETO = ("FRENTE", "IZQUIERDA", "DERECHA")
MAX_RETOS_ACTIVOS = 2000

_azar = random.SystemRandom()


class AlmacenRetos:
    def __init__(self, ttl_segundos: int = 60, maximo: int = MAX_RETOS_ACTIVOS):
        self.ttl = ttl_segundos
        self.maximo = maximo
        self._retos: dict[str, tuple[tuple[str, ...], str, float]] = {}
        self._lock = threading.Lock()

    def _purgar(self, ahora: float) -> None:
        vencidos = [k for k, (_, _, vence) in self._retos.items() if vence <= ahora]
        for clave in vencidos:
            del self._retos[clave]

    def emitir(self, origen: str) -> tuple[str, tuple[str, ...], int]:
        """Crea un reto para `origen` (la IP). Devuelve (id, poses, segundos de vigencia)."""
        poses = tuple(_azar.sample(POSES_RETO, k=len(POSES_RETO)))
        reto_id = secrets.token_urlsafe(24)
        ahora = time.monotonic()
        with self._lock:
            self._purgar(ahora)
            if len(self._retos) >= self.maximo:
                # Descarta el mas antiguo para no crecer sin limite si alguien pide retos en masa.
                mas_viejo = min(self._retos, key=lambda k: self._retos[k][2])
                del self._retos[mas_viejo]
            self._retos[reto_id] = (poses, origen, ahora + self.ttl)
        return reto_id, poses, self.ttl

    def consumir(self, reto_id: str, origen: str) -> tuple[str, ...] | None:
        """Devuelve las poses del reto y lo invalida (un solo uso). None si no existe, vencio o es de otro origen."""
        ahora = time.monotonic()
        with self._lock:
            self._purgar(ahora)
            reto = self._retos.pop(reto_id, None)
        if reto is None or reto[1] != origen:
            return None
        return reto[0]


retos_faciales = AlmacenRetos()
