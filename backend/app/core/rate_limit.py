"""Limite de intentos fallidos en memoria, por clave (por ejemplo, la IP del cliente).

Solo cuenta los FALLOS: un ingreso correcto no consume el cupo. Funciona con un solo proceso
de uvicorn (la configuracion actual del contenedor). Si se escala a varios procesos, mover el contador a Redis.
"""
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, status


class LimitadorIntentos:
    def __init__(self, maximo: int, ventana_segundos: int):
        self.maximo = maximo
        self.ventana = ventana_segundos
        self._fallos: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def _limpiar(self, clave: str, ahora: float) -> deque:
        historial = self._fallos[clave]
        while historial and ahora - historial[0] > self.ventana:
            historial.popleft()
        return historial

    def verificar(self, clave: str) -> None:
        """Lanza 429 si la clave ya acumula demasiados fallos en la ventana."""
        ahora = time.monotonic()
        with self._lock:
            historial = self._limpiar(clave, ahora)
            if len(historial) >= self.maximo:
                reintento = int(self.ventana - (ahora - historial[0])) + 1
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    "Demasiados intentos fallidos. Espera unos minutos antes de volver a intentar.",
                    headers={"Retry-After": str(reintento)},
                )

    def registrar_fallo(self, clave: str) -> None:
        ahora = time.monotonic()
        with self._lock:
            self._limpiar(clave, ahora).append(ahora)


# 10 fallos por IP cada 10 minutos para cada tipo de ingreso.
limitador_login = LimitadorIntentos(maximo=10, ventana_segundos=600)
limitador_face_login = LimitadorIntentos(maximo=10, ventana_segundos=600)
