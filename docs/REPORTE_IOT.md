# Reporte IoT: terminal de pedidos por voz (ESP32)

Fecha del reporte: 2026-11-26
Proyecto: Trattoria Bellavista (FastAPI + PostgreSQL + React/Vite + Caddy + Docker).
Para qué sirve este archivo: retomar el trabajo en otra conversación sin perder contexto.

## 1. Objetivo

Una terminal con un ESP32 para la demostración en clase. El mesero mantiene presionado un botón y dice el pedido con el número de mesa. La IA lo interpreta contra el menú. Si falta algo, pregunta. Al confirmar, crea el pedido y aparece en la pantalla de cocina.

Restricciones: usar solo el ESP32 que ya se tiene más piezas baratas (Bogotá, Mercado Libre). El modelo es Gemini con la clave propia del usuario (capa gratuita), con un intérprete local por reglas como respaldo.

La idea anterior de ubicar trabajadores (BLE, zonas, trilateración) se abandonó y se eliminó del código.

## 2. Qué está hecho

Todo se integró al repositorio de la organización (`Restaurante-Tattoria-Bellavista/restaurante-italiano-software`), rama `feature/pedido-por-voz` sobre `dev`. El trabajo original salió del repositorio personal (commit `3400fd4`), que quedó como histórico.

### Backend (`backend/`)
- `app/services/voz_service.py`: núcleo del asistente.
  - Llama a Gemini por REST con el modelo `gemini-flash-lite-latest`. Si falla, usa `gemini-3.1-flash-lite`, con 12 s de timeout por modelo.
  - Si Gemini falla con texto, cae al intérprete por reglas en español. Con audio no hay respaldo y responde 422.
  - La salida de Gemini no se toma como confiable: el servidor valida productos contra el menú, que la mesa exista y cantidades de 1 a 20.
  - Mantiene el estado de la conversación por `sesion` en memoria (TTL de 600 s).
- `app/routers/voz.py`:
  - `GET /api/v1/voz/estado`, `POST /api/v1/voz/interpretar` y `POST /api/v1/voz/confirmar`: requieren sesión de usuario.
  - `POST /api/v1/voz/audio?sesion=...`: recibe el WAV crudo. **`X-Device-Key` es obligatoria**: sin `VOZ_DEVICE_KEY` en el servidor responde 503 y con una clave incorrecta 401.
- `GET /api/v1/cocina/comandas`: comandas para cocina (pedidos ABIERTO, EN_PREPARACION y LISTO con sus productos y el número de mesa), las más antiguas primero. `GET /api/v1/cocina` se conserva sin cambios.
- Los errores usan el contrato del proyecto (`{"error": {"code", "message"}}`).
- Si la mesa ya tiene un pedido que pasó a cocina, el asistente responde 409 en lugar de modificarlo.
- Pruebas en `backend/tests/` (`pytest`; usan SQLite en memoria, sin Docker ni Postgres):
  - pruebas offline de voz y cocina;
  - `test_gemini_live.py`, que usa la clave real y se omite si no hay clave.
  - La última corrida completa pasó. Se agregaron pruebas de cocina después de esa corrida.

### Frontend (`frontend-react/`)
- `VozPage.jsx`: página "Pedido por voz" con micrófono del navegador (Chrome, `es-CO`), texto y respuestas habladas.
- `CocinaPage.jsx` y `styles/cocina.css`: pantalla de cocina rediseñada.
  - Columnas Pendientes / En preparación / Listos.
  - Número de mesa grande y colores de urgencia a los 10 y 20 minutos.
  - Insignia "NUEVO" con pitido opcional, pantalla completa y aviso sin conexión.
  - Actualización inmediata por WebSocket cuando cambian pedidos, más un refresco cada 5 s de respaldo.

### Firmware (`firmware/voice-terminal/`, PlatformIO)
- `src/main.cpp`:
  - Graba mientras se mantiene el botón (8 kHz, 16 bits, mono, máximo 5 s).
  - Quita el nivel DC y normaliza (ganancia máxima 30×).
  - Envía el WAV por HTTP POST al backend.
  - Muestra la respuesta en la OLED y emite pitidos por el DAC (GPIO25) hacia el amplificador.
- Soporta dos tipos de micrófono con `MIC_I2S` en `config.h`: `1` = INMP441 (I2S, recomendado) y `0` = módulo analógico.
- Compila en ambos modos. **No se ha probado en hardware real.**
- `include/config.h` no se sube a git. Se crea copiando `config.example.h` y completando WiFi, IP del PC (`API_BASE`), `SESION_ID` y `DEVICE_KEY`.

### Documentación
- `docs/conexiones.html` y `docs/images/conexiones.png`: diagrama de cableado con los nombres reales de los pines de las placas compradas.

## 3. Qué falló en la compra

| Pieza comprada | Problema | Qué hacer |
|---|---|---|
| Sensor de sonido azul de 3 pines (`OUT / GND / VCC`, LM393) | Es un detector de ruido digital, como un detector de aplausos. **No graba la voz.** No sirve para este proyecto. | No usarlo. Comprar el INMP441. |

El firmware ya está listo para el INMP441, así que al conectarlo no hay que cambiar código.

## 4. Qué falta

### Por comprar
1. **Micrófono INMP441 (I2S).** Es imprescindible. Opciones en Mercado Libre Colombia:
   - https://articulo.mercadolibre.com.co/MCO-888095186-inmp441-microfono-omnidireccional-i2s-24-bits-para-esp32-_JM
   - https://articulo.mercadolibre.com.co/MCO-1430343897-modulo-microfono-mems-inmp441-i2s-alta-precision-esp32-_JM
2. **Soldadura.** El amplificador (pads sin pines), el parlante y el botón necesitan cables soldados. Si no hay cautín, se puede pedir en una tienda de electrónica, y suele costar poco.
3. Verificar que haya cables jumper suficientes y que el INMP441 venga con pines (si no, soldarlos).

### Por hacer (técnico)
1. Cablear según `docs/images/conexiones.png` (resumen en la sección 5).
2. Copiar `config.example.h` a `config.h`, completar los datos y flashear (`pio run -t upload`). `API_BASE` debe ser `https://<IP o dominio>`: el proxy Caddy solo sirve HTTPS y el firmware acepta el certificado sin validarlo (`setInsecure`), válido para la demostración pero no para producción.
3. Probar en orden: OLED, pitido de arranque, botón, micrófono, pedido completo.
4. Ajustar la calidad del audio con hardware real (ganancia, cercanía al micrófono, ruido del aula).
5. Que el PC con el backend y el ESP32 estén en la misma red WiFi. Para la clase, lo más simple es levantar Docker Compose en el PC y poner `https://<IP del PC>` en `API_BASE`.
6. Respuestas habladas desde el ESP32 (TTS): no está hecho. Hoy las respuestas se ven en la OLED y suenan pitidos.
7. No verificado todavía: la pantalla de cocina en un navegador, ni nada contra PostgreSQL real (Docker estaba apagado).
8. Si la API queda pública: validar el certificado TLS en el firmware (`setCACert`) y rotar `VOZ_DEVICE_KEY`.
9. Con varias réplicas en Kubernetes, la conversación por `sesion` vive en memoria de cada pod: usar una sola réplica del backend o mover las sesiones a la base de datos.

### Seguridad
- **La clave de Gemini salió en una captura de pantalla. Hay que rotarla después de la clase.**
- La clave vive en `.env` y `backend/.env`, que están en `.gitignore`. Los `.env.example` quedan con `GEMINI_API_KEY=` vacío. Nunca debe subirse a git.
- `VOZ_DEVICE_KEY` es obligatoria y distinta por entorno: generarla con `python -c "import secrets; print(secrets.token_urlsafe(32))"`.

## 5. Cableado (resumen)

Todos los GND comparten el riel negro/azul de la protoboard y todos los 3V3 el riel rojo. Cablear con el ESP32 sin USB.

| Componente | Conexión |
|---|---|
| ESP32 | pin GND al riel GND, pin 3V3 al riel 3V3 |
| OLED | VCC al riel 3V3, GND al riel GND, SDA a D21, SCL a D22 |
| Botón | un terminal a D4, el otro al riel GND |
| Amplificador PAM8403 | `Power +` a VIN, `Power −` al riel GND, entrada `L` a D25, `G` al riel GND, `Lout +` y `Lout −` a los dos terminales del parlante |
| INMP441 | VDD al riel 3V3, GND y L/R al riel GND, SD a D32, WS a D33, SCK a D27 |

Notas: la perilla del amplificador debe ir casi al mínimo, porque el parlante es de 8 Ω y 0.5 W. El ESP32 se alimenta solo por USB, nunca con el adaptador de pared negro.

## 6. Cómo correr y probar

- Con Docker (recomendado): definir `GEMINI_API_KEY` y `VOZ_DEVICE_KEY` en el `.env` de la raíz y ejecutar `docker compose up -d --build`.
- Sin Docker: en `backend/`, crear `.env` (ver `.env.example`) y ejecutar `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
- Pruebas: `pytest backend/tests` (las que usan Gemini real se omiten sin clave).
- Frontend: en `frontend-react/`, `npm install` y `npm run dev` (o el servicio `frontend` de Compose).
- Prueba sin hardware: abrir "Pedido por voz" en Chrome y decir "mesa cuatro, dos spaghetti carbonara y una limonada", y luego "eso es todo". El pedido debe aparecer en cocina.

## 7. Notas útiles

- Latencia típica de Gemini con flash-lite: cerca de 1 s por turno (una vez tardó 26 s).
- `gemini-2.5-flash` devolvió 404 ("no longer available to new users") y los modelos flash grandes dieron 503 o timeouts, por eso el modelo por defecto es flash-lite con respaldo.
- Los errores de Gemini son visibles en la respuesta como `motor_error` (sin exponer la clave).
