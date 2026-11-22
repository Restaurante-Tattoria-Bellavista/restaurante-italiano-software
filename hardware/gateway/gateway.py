"""Gateway de zona: escucha etiquetas BLE cercanas y reporta su señal al backend.

Uso:
    python gateway.py --zona Salon --url https://localhost --token TOKEN_DEL_GATEWAY

El token es un secreto del gateway (variable GATEWAY_TOKEN del backend). No es una sesión de usuario.
Requiere Bluetooth encendido. En Windows usa el adaptador de la laptop mediante bleak.
"""
import argparse
import asyncio
import json
import ssl
import statistics
import time
import urllib.request

from bleak import BleakScanner

PREFIJO = b"TB:"
ENVIO_CADA_SEGUNDOS = 5


def etiqueta_desde_anuncio(datos_fabricante: dict) -> str | None:
    """Extrae el identificador TB:<ID> de los datos de fabricante del anuncio."""
    for carga in datos_fabricante.values():
        if carga.startswith(PREFIJO):
            return carga[len(PREFIJO):].decode("ascii", errors="ignore") or None
        if PREFIJO in carga:
            return carga.split(PREFIJO, 1)[1].decode("ascii", errors="ignore") or None
    return None


async def main(zona: str, url: str, token: str, insegura: bool) -> None:
    # Todas las lecturas de cada etiqueta en la ventana de envío; se envía la mediana (más estable que un solo valor).
    muestras: dict[str, list[int]] = {}
    contexto = ssl._create_unverified_context() if insegura else None

    def al_detectar(dispositivo, anuncio):
        etiqueta = etiqueta_desde_anuncio(anuncio.manufacturer_data or {})
        if etiqueta:
            muestras.setdefault(etiqueta, []).append(anuncio.rssi)

    scanner = BleakScanner(detection_callback=al_detectar)
    await scanner.start()
    print(f"Gateway de zona '{zona}' escuchando. Ctrl+C para detener.")
    try:
        while True:
            await asyncio.sleep(ENVIO_CADA_SEGUNDOS)
            if not muestras:
                continue
            cuerpo = {
                "zona": zona,
                "lecturas": [
                    {"etiqueta": e, "rssi": int(statistics.median(valores))}
                    for e, valores in muestras.items()
                ],
                "momento": int(time.time()),
            }
            print("muestras:", {e: len(v) for e, v in muestras.items()})
            muestras.clear()
            enviar(url, token, cuerpo, contexto)
    finally:
        await scanner.stop()


def enviar(url: str, token: str, cuerpo: dict, contexto) -> None:
    req = urllib.request.Request(
        url.rstrip("/") + "/api/ubicaciones/lecturas",
        data=json.dumps(cuerpo).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "X-Gateway-Token": token},
    )
    try:
        with urllib.request.urlopen(req, context=contexto, timeout=5) as r:
            print("enviado", len(cuerpo["lecturas"]), "lecturas ->", r.status)
    except Exception as exc:  # red caída o backend apagado: se reintenta en el siguiente ciclo
        print("no se pudo enviar:", exc)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--zona", required=True)
    parser.add_argument("--url", default="https://localhost")
    parser.add_argument("--token", required=True)
    parser.add_argument("--insegura", action="store_true", help="acepta certificado local de Caddy")
    args = parser.parse_args()
    asyncio.run(main(args.zona, args.url, args.token, args.insegura))
