# Terminal ESP32: micrófono + localizador (documento de traspaso)

Un solo ESP32 hace dos trabajos:

| Función | Cómo | Dónde se ve en la web |
|---|---|---|
| **Micrófono de pedidos** | INMP441 (I2S) → WAV 8 kHz → `POST /api/v1/voz/audio` → Gemini → pedido en Cocina | Páginas **Cocina** y **Voz** |
| **Localizador** | Anuncia por Bluetooth (BLE) la etiqueta `TB:<ETIQUETA>`; el *gateway* (PC con Bluetooth) mide la señal (RSSI) y la manda al backend | Página **Personal en tiempo real** |
| **Estado de la placa** | Latido cada 30 s a `POST /api/v1/voz/latido` | Tarjeta **Terminal ESP32** arriba en la página **Voz** |

```
 ESP32 ──WiFi/HTTPS──► Caddy ──► Backend (FastAPI) ──► PostgreSQL
   │  ▲  audio + latido                │
   │  └── OLED / pitidos               └─► WebSocket ─► Web (Cocina, Voz, Personal)
   └──BLE (anuncio TB:T01)──► Gateway (PC) ──HTTPS + X-Gateway-Token──► Backend
```

## 1. Estado al momento del traspaso

**Hecho y probado con pruebas automáticas** (`cd backend && pytest`):
- Backend: audio, interpretación, latido, listado de terminales, ubicaciones, autenticación del dispositivo.
- Web: página Voz con la tarjeta de la terminal, Cocina en vivo, Personal en tiempo real.
- Caddy responde TLS también por IP (`default_sni` en `docker/caddy/Caddyfile`), necesario porque el ESP32 conecta a `https://<IP>` sin nombre de servidor.

**NO probado en hardware real** (el equipo donde se desarrolló no detecta el ESP32 por USB; falta cable de datos o driver):
- Compilación y arranque del firmware en la placa.
- Captura de audio del INMP441, OLED, botón, parlante.
- Conexión del ESP32 al backend por `https://<IP del PC>`.
- Coexistencia WiFi + BLE en la misma placa (ver riesgos).
- Calibración de la distancia.

## 2. Hardware y conexiones

Todo se alimenta del ESP32 DevKit. Desconéctalo del USB mientras cableas.

| Componente | Pin del módulo | ESP32 |
|---|---|---|
| **Micrófono INMP441** | VDD | 3V3 (no 5V) |
| | GND | GND |
| | L/R | **GND** |
| | SCK | GPIO 27 |
| | WS | GPIO 33 |
| | SD | GPIO 32 |
| **OLED SSD1306 (I2C, 0x3C)** | VCC / GND | 3V3 / GND |
| | SDA / SCL | GPIO 21 / GPIO 22 |
| **Botón** | un lado / otro | GPIO 4 / GND |
| **Parlante vía PAM8403** | entrada L | GPIO 25 (DAC1) |
| | +5V / GND | VIN (5V) / GND |
| | salida L+ y L− | parlante 8 Ω |

Diagrama: `docs/images/conexiones.png` y `docs/conexiones.html`. Los módulos INMP441 traen el orden de pines distinto según el fabricante: **guíate por las letras impresas**, no por la posición.

## 3. Puesta en marcha

### 3.1 Backend (Docker)
En `.env` (no se versiona) deben existir `VOZ_DEVICE_KEY`, `GATEWAY_TOKEN` y `GEMINI_API_KEY` (ver `.env.docker.example`). Sin `VOZ_DEVICE_KEY` el servidor responde 503 a la terminal; sin `GEMINI_API_KEY` el audio no se entiende (el texto escrito sí, con reglas locales).

```bash
docker compose up -d --build
```

### 3.2 Firmware
1. Instala [PlatformIO](https://platformio.org/) (extensión de VS Code o `pip install platformio`).
2. `cd firmware/voice-terminal` y copia `include/config.example.h` a `include/config.h` (este archivo **no se sube a git**).
3. Edita `config.h`:
   - `WIFI_SSID`, `WIFI_PASS`: la red del PC y del ESP32 (la misma).
   - `API_BASE`: `https://<IP del PC>` (PowerShell: `ipconfig`, "Dirección IPv4").
   - `DEVICE_KEY`: el mismo valor de `VOZ_DEVICE_KEY` del `.env`.
   - `SESION_ID`: nombre de la terminal (ej. `terminal-1`); `ETIQUETA_BLE`: id de la placa (ej. `T01`).
4. `pio run -t upload` y luego `pio device monitor` (115200). Debe verse la IP, `Localizador BLE activo: TB-T01` y `latido -> HTTP 200`.

### 3.3 Gateway (localizador)
En un PC con Bluetooth, cerca de la placa:

```bash
pip install bleak
python hardware/gateway/gateway.py --zona Salon --url https://localhost --token <GATEWAY_TOKEN> --insegura
```

`--insegura` acepta el certificado interno de Caddy en `localhost`. Para que la web muestre a quién pertenece la placa, en **Personal en tiempo real** (admin) escribe la etiqueta `T01` junto al nombre del mesero.

## 4. Pruebas de aceptación (en este orden)

1. **Placa viva:** el monitor serie muestra IP y `latido -> HTTP 200`; en la web (Voz) la tarjeta pasa a "● En línea".
2. **Micrófono:** mantén el botón, di "Mesa 3, una pizza margherita y una limonada", suelta. En el monitor aparece `grabado: ... pico crudo=...` (si el pico es muy bajo, revisa cableado del INMP441, sobre todo L/R a GND) y la OLED responde. Di "eso es todo": el pedido aparece en **Cocina**.
3. **Localizador:** con el gateway corriendo, la tarjeta y **Personal** muestran zona, dBm y metros aproximados. Aleja la placa: la distancia debe crecer.
4. **Demo del requisito de clase:** tráfico a `/metrics`, Grafana (métrica de la IA), autenticación (`docs/autenticacion.md`).

## 5. Calibrar la distancia
La distancia es **orientativa**: `d = 10^((RSSI_1m − rssi) / (10·n))` en `backend/app/routers/ubicaciones.py` (`RSSI_A_1M = -54`, `FACTOR_ENTORNO_N = 2.5`). Esos valores vienen de otra etiqueta y otro lugar. Para ajustarlos:
1. Deja la placa a **1 m** del PC del gateway y deja correr el gateway ~1 min.
2. Toma la mediana de `rssi` (la web lo muestra en dBm) y ponla en `RSSI_A_1M`.
3. Mide a 4 m: con `n = (RSSI_1m − rssi_4m) / (10·log10(4))` obtienes el `FACTOR_ENTORNO_N` de tu local.

## 6. Riesgos y problemas conocidos
- **Memoria:** WiFi + TLS + BLE + buffer de audio (80 KB) en un ESP32 sin PSRAM es justo. Por eso se usa NimBLE (mucho más ligero que el BLE por defecto) y el latido imprime `memoria libre`. Si baja de ~30 KB o hay reinicios, pon `BLE_ACTIVO 0` o reduce `MAX_REC_SEGUNDOS`.
- **Redes aisladas:** muchas redes (universidad) impiden que los dispositivos se vean entre sí. Usa el hotspot del celular para el PC y el ESP32.
- **Firewall de Windows:** puede bloquear el puerto 443 de entrada. Si el ESP32 no conecta, permite `Caddy`/443 en la red privada.
- **TLS sin validar:** el ESP32 usa `setInsecure()` (cifra pero no verifica el servidor). Aceptable en red local de demostración; con dominio público conviene `setCACert`.
- **Estado de terminales en memoria del backend:** con 2 réplicas en Kubernetes cada réplica ve solo los latidos que recibió; con el latido cada 30 s todas lo ven en pocos segundos, pero un reinicio del pod borra el historial.
- **Gemini:** la clave gratuita tiene límites; con 429 el servidor responde error claro y el audio no se interpreta. **Rota la clave que se mostró en una captura** y guárdala solo en `.env` / Secret de Kubernetes.
- **Sesiones de voz** (borrador del pedido): se guardan en la tabla `voz_sesiones`, funcionan con varias réplicas. Si la base ya existía, aplica `database/schema.sql` (es idempotente).

## 7. Mapa de archivos

| Qué | Dónde |
|---|---|
| Firmware terminal (voz + BLE + latido) | `firmware/voice-terminal/src/main.cpp`, `include/config.example.h` |
| Firmware etiqueta BLE sola (alternativa) | `hardware/etiqueta_ble/` |
| Gateway BLE | `hardware/gateway/gateway.py` |
| API de voz, latido y terminales | `backend/app/routers/voz.py`, `backend/app/services/voz_service.py` |
| API de ubicaciones | `backend/app/routers/ubicaciones.py` |
| Web: Voz, tarjeta, Personal, Cocina | `frontend-react/src/pages/VozPage.jsx`, `components/TerminalesEsp32.jsx`, `pages/PersonalPage.jsx`, `pages/CocinaPage.jsx` |
| Pruebas | `backend/tests/test_voz.py`, `test_cocina.py`, `test_autenticacion.py` |
| Reporte de hardware y compras | `docs/REPORTE_IOT.md` |
| Autenticación (JWT, roles) | `docs/autenticacion.md` |
| IA (Gemini, Face ID) | `docs/ia.md` |

## 8. Pendiente (en orden de prioridad)
1. Conseguir cable USB de datos / driver (CP2102 o CH340) y flashear.
2. Ejecutar las pruebas de aceptación de la sección 4 y corregir lo que falle (el firmware se compiló pero nunca corrió en la placa).
3. Calibrar la distancia (sección 5).
4. Rotar la clave de Gemini y cargar los secretos en el Secret de Kubernetes (`k8s/secret.example.yaml`).
5. Historias de usuario en el GitHub Project para IoT (voz y localizador), autenticación y roles.
