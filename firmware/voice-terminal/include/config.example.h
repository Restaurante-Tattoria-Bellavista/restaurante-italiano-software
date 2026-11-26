// Copia este archivo como config.h y completa los valores. config.h NO se sube a git.
#pragma once

#define WIFI_SSID "tu-wifi"
#define WIFI_PASS "tu-clave"

// URL base del backend, SIN "/" final, tal como la ve el navegador (pasa por el proxy Caddy, que solo
// sirve HTTPS). Con la IP de tu PC en la WiFi (PowerShell: ipconfig -> "Direccion IPv4"), por ejemplo
// https://192.168.1.50 (puerto HTTPS_PORT, 443 por defecto) o, en un despliegue publico, https://tu-dominio.
// Si ejecutas uvicorn directamente sin Docker, usa http://192.168.1.50:8000 (con --host 0.0.0.0).
#define API_BASE "https://192.168.1.50"

// Nombre de esta terminal: el servidor guarda la conversacion (borrador del pedido) por sesion.
#define SESION_ID "terminal-1"

// OBLIGATORIA: el mismo valor de VOZ_DEVICE_KEY del .env del backend (sin ella el servidor responde 503).
#define DEVICE_KEY "CAMBIAR_VOZ_DEVICE_KEY"

// ---- Localizador BLE (la misma placa anuncia su posicion) ----
// 1 = anuncia por Bluetooth la etiqueta y reporta; 0 = solo terminal de voz.
#define BLE_ACTIVO 1
// Identificador de ESTA placa (letras, numeros, - o _). Se asigna a un mesero en la web:
// "Personal en tiempo real" -> campo de etiqueta. Usa uno distinto por placa (T01, T02, ...).
#define ETIQUETA_BLE "T01"
// Cada cuantos segundos avisa al servidor que sigue encendida y conectada.
#define LATIDO_CADA_SEGUNDOS 30

// ---- Pines (ESP32 DevKit clasico) ----
#define PIN_BOTON 4        // boton entre este pin y GND (se usa la resistencia interna)
// Tipo de microfono: 1 = INMP441 (I2S, digital, RECOMENDADO) | 0 = modulo analogico con salida de audio (A0).
// OJO: los modulos de sonido de 3 pines "OUT/GND/VCC" con LM393 son solo detectores de ruido: NO sirven.
#define MIC_I2S 1
// INMP441 (I2S):
#define PIN_MIC_SCK 27     // SCK/BCLK
#define PIN_MIC_WS 33      // WS/LRCL
#define PIN_MIC_SD 32      // SD/DOUT   (L/R del INMP441 va a GND)
// Modulo analogico (solo si MIC_I2S = 0):
#define PIN_MIC 34         // salida de audio del modulo (pin solo-entrada, ADC1)
#define PIN_DAC 25         // DAC1 -> entrada L del amplificador PAM8403
#define PIN_LED 2          // LED integrado
#define PIN_OLED_SDA 21
#define PIN_OLED_SCL 22
#define OLED_ADDR 0x3C

// ---- Audio ----
#define SAMPLE_RATE 8000   // Hz
#define MAX_REC_SEGUNDOS 5 // el buffer ocupa SAMPLE_RATE*MAX_REC_SEGUNDOS*2 bytes (80 KB)
#define MIN_REC_MS 400     // grabaciones mas cortas se descartan
#define GANANCIA_MAX 30.0f // tope de amplificacion digital (evita subir solo ruido)
