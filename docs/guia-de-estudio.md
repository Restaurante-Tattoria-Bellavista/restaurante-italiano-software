# Guía de estudio y exposición — Trattoria Bellavista

Documento para entender el proyecto completo y poder exponerlo. Cubre qué hace, cómo está armado, cómo se demuestra y qué responder si preguntan.

---

## 1. En una frase

Sistema web para gestionar un restaurante italiano (mesas, menú, clientes, reservas, pedidos, cocina, reportes) con un **extra de voz**: un mesero puede dictar un pedido —desde una terminal con ESP32 o desde la página web— y el pedido aparece en el **tablero de cocina**, todo monitoreado en **Grafana**.

## 2. Piezas y puertos

| Pieza | Tecnología | Puerto local | Para qué |
|---|---|---|---|
| Frontend | React + Vite, servido por Nginx detrás de Caddy | https://localhost | Interfaz de gerente/cocina; Nginx también hace de proxy hacia la API |
| Backend | FastAPI (Python), SQLAlchemy | 8001 | API REST `/api/v1/...` y `/api/voz/...` |
| Base de datos | PostgreSQL 17 | interno | Mesas, productos, pedidos, etc. |
| Grafana | Grafana 11.3 | 3000 | Dashboard operativo leyendo Postgres (rol solo lectura) |
| IA | Gemini (API de Google) | externo | Transcribe y entiende el audio |
| Terminal de voz | ESP32 + INMP441 + botón | WiFi | Graba y envía el audio al backend |

Todo se levanta con **Docker Compose** (`docker compose up -d --build`).

## 3. Cómo viaja un pedido por voz

```
Mesero habla ─▶ ESP32 (botón) ─▶ WAV 8 kHz ─▶ POST /api/voz/audio ─┐
Mesero sube audio en la web ─▶ WAV 16 kHz ─▶ POST /api/voz/audio-web ┤
                                                                      ▼
                                   voz_service.interpretar → Gemini (JSON con productos y mesa)
                                   · valida contra el menú y las mesas reales (el texto NO es confiable)
                                   · si falta algo, devuelve una pregunta de aclaración
                                                                      ▼
                       borrador guardado en memoria por «sesión» (10 min de vida)
                                                                      ▼
              «eso es todo» (voz)  o  botón «Confirmar» (web)  ─▶ confirmar_pedido
                                                                      ▼
                       pedido ABIERTO + detalle_pedido (suma si el producto ya estaba)
                                                                      ▼
                         Tablero de cocina (consulta /api/v1/cocina cada 4 s)
```

Ideas clave para explicar:
- **Gemini solo propone**; el backend valida todo (producto del menú, mesa existente, cantidad 1–20). Es una defensa contra audio/texto malicioso o alucinaciones.
- **Respaldo local por reglas**: si Gemini falla o no hay clave, el texto (no el audio) se interpreta con reglas y coincidencia aproximada (`difflib`).
- **Sesión por terminal**: el ESP32 no tiene pantalla de estado, así que el servidor recuerda el borrador de cada `sesion` (`terminal-1`, `web-web`...).
- **Dos endpoints de audio**: `/api/voz/audio` exige la cabecera `X-Device-Key` (el ESP32 la lleva grabada); `/api/voz/audio-web` no, porque una clave en JavaScript sería pública.

## 4. Estados de un pedido (y el tablero de cocina)

```
ABIERTO ──▶ EN_PREPARACION ──▶ LISTO ──▶ ENTREGADO ──▶ PAGADO
   └──────────────┴──▶ CANCELADO
```

| Columna del tablero | Estado | Botón |
|---|---|---|
| Nuevos | ABIERTO | Empezar a preparar |
| En preparación | EN_PREPARACION | Marcar listo |
| Listos para entregar | LISTO | Entregado |

Todas las rutas exigen sesión (login por contraseña o rostro, del PR de autenticación); el ESP32 es la excepción y usa solo su clave de dispositivo.

Un pedido por voz nace `ABIERTO`, aparece en **Nuevos** con la etiqueta roja **NUEVO** unos segundos. Reglas de la BD: no se puede enviar a preparación un pedido sin productos; las líneas solo se editan mientras el pedido está `ABIERTO`.

## 5. Base de datos (tablas principales)

`mesas` (número, capacidad, estado LIBRE/OCUPADA/RESERVADA/FUERA_DE_SERVICIO) · `mesa_layout` (posición en el plano) · `productos` (nombre, precio, categoría, disponible) · `pedidos` (mesa, estado, total) · `detalle_pedido` (producto, cantidad, precio, subtotal, observación) · `clientes` · `reservas` · `restaurante_config`.
`schema.sql` y `seed.sql` crean y cargan todo al iniciar un volumen nuevo; también hay restricciones y *triggers* (no cruzar reservas, total = suma de líneas…). Detalle en `database/diccionario-datos.md`.

## 6. API que conviene conocer

| Método y ruta | Uso |
|---|---|
| `GET /health`, `/health/db` | Salud del servicio y de la base |
| `GET/POST/PATCH /api/v1/mesas`, `/productos`, `/clientes`, `/reservas` | CRUD |
| `POST /api/v1/pedidos`, `/pedidos/{id}/detalles`, `PATCH /pedidos/{id}/estado` | Ciclo del pedido |
| `GET /api/v1/cocina` | Pedidos ABIERTO/EN_PREPARACION/LISTO con mesa y productos |
| `POST /api/voz/audio` · `/audio-web` | Audio WAV crudo → interpretación |
| `POST /api/voz/interpretar` | Texto → interpretación |
| `POST /api/voz/confirmar` | Borrador → pedido real |
| `DELETE /api/voz/sesion/{id}` | Descartar borrador de la web |
| `GET /docs` | Swagger (documentación interactiva) |

## 7. El firmware del ESP32 (`firmware/voice-terminal`)

- **Botón** en GPIO 4 → GND (resistencia interna). Mantener = grabar; soltar = enviar.
- **Micrófono INMP441 (I2S)**: SCK=18, WS=19, SD=23, L/R a GND, VDD a 3V3.
- Graba hasta 5 s a 8 kHz, normaliza el volumen (ganancia máx. 30×), arma un WAV y lo envía por HTTP.
- Sin pantalla OLED conectada, todo sale por el **monitor serie** (115200 baudios).
- **Diagnóstico**: cada 3 s imprime `[senal]` (WiFi, RSSI, distancia estimada) y `[mic]` (rango de la señal; «SIN SENAL» si es plana).
- Configuración en `include/config.h` (no se versiona): WiFi 2.4 GHz, `API_BASE` (IP del PC y puerto 8001), `DEVICE_KEY`.
- Comandos: `python -m platformio run -t upload --upload-port COM3` y `python -m platformio device monitor`.

**Estado real:** botón, WiFi, servidor y Gemini funcionan; el micrófono devuelve una lectura plana (`0x00000000`). Posible hardware (soldadura, SD, alimentación o módulo). La historia completa de pruebas está en el README, sección 12.2. Para exponer, la demostración de voz se hace con **audio subido en la web**, que sí funciona.

## 8. Guion de demostración (5–7 min)

1. `docker compose ps` → los 4 servicios *healthy*.
2. **Frontend** `https://localhost` (iniciar sesión con el usuario admin) → mesas, menú, reportes.
3. **Pedido por voz** (menú lateral) → subir/grabar «mesa tres, dos lasagna de la casa» → *Procesar* → mostrar lo entendido → *Confirmar y enviar a cocina*.
4. **Cocina** → aparece el pedido en *Nuevos* con **NUEVO** → *Empezar a preparar* → *Listo* → *Entregado*.
5. **Grafana** `http://localhost:3000` (admin) → dashboard «Operacion»: pedidos por hora, estados, top de productos.
6. **ESP32** (si se muestra): monitor serie con `[senal]` en verde (RSSI), explicar el estado del micrófono con honestidad.
7. (Opcional) `https://localhost/docs` para mostrar la API.

## 9. Preguntas probables y respuestas

- **¿Por qué una IA y no solo reglas?** Las reglas fallan con acentos, sinónimos y ruido; Gemini transcribe y entiende. Las reglas quedan de respaldo.
- **¿Qué pasa si Gemini alucina un plato?** No se acepta: el backend solo admite productos del menú y pregunta «¿quisiste decir…?».
- **¿Y si falla internet o la IA?** Cae al intérprete por reglas para texto; para audio se pide repetir (no hay transcripción local).
- **¿Es seguro?** El endpoint del ESP32 exige clave de dispositivo (comparación en tiempo constante); Grafana usa un rol de solo lectura; las claves van en `.env`, que no se sube a git. Las rutas de voz de la web exigen sesión (JWT); el ESP32 entra solo por `/api/voz/audio` con su clave.
- **¿Por qué el pedido queda ABIERTO y no EN_PREPARACION?** Para que cocina lo vea como *nuevo* y decida cuándo empezar; así el flujo es el mismo que un pedido manual.
- **¿Por qué no funcionó el micrófono?** Lectura I2S plana; se descartó software (canales, pines, SCK/WS) y quedó como fallo de hardware; hay diagnóstico integrado.
- **¿Escala?** El borrador de sesión vive en memoria de un solo proceso: para varias réplicas habría que moverlo a Redis o a la base. Anotado como mejora.

## 10. Mejoras propuestas

- Cambiar/soldar el micrófono y validar en campo; añadir OLED y altavoz (el firmware ya los soporta).
- Mover sesiones de voz a la base de datos; WebSocket/SSE en vez de *polling* en cocina.
- Login y roles (mesero, cocina, gerente) y proteger los endpoints de voz.
- Métricas de la IA (latencia, aciertos) en Grafana.

## 11. Comandos útiles

```powershell
docker compose up -d --build          # levantar todo
docker compose ps                     # estado
docker compose logs -f backend        # logs
docker compose down                   # apagar (conserva datos)
docker compose down -v                # apagar y BORRAR datos
cd backend; python -m pytest -q       # pruebas del backend
cd frontend-react; npm run build      # compilar el frontend
```

Notas: si Docker falla con `invalid file request Dockerfile`, el proyecto está en OneDrive; copiarlo a una ruta como `C:\dev\...` y construir desde ahí.

## 12. Dónde está cada cosa

| Tema | Archivo |
|---|---|
| Interpretación de voz | `backend/app/services/voz_service.py` |
| Endpoints de voz | `backend/app/routers/voz.py` |
| Tablero de cocina (API) | `backend/app/routers/operacion.py` (`/cocina`) |
| Pantalla de cocina | `frontend-react/src/pages/CocinaPage.jsx` |
| Pantalla de pedido por voz | `frontend-react/src/pages/VozPage.jsx`, `services/audio.js` |
| Firmware | `firmware/voice-terminal/src/main.cpp`, `include/config.example.h` |
| Grafana | `docker/grafana/` |
| Compose y variables | `docker-compose.yml`, `.env.docker.example` |
| Bitácora de pruebas | `README.md` §12 |
