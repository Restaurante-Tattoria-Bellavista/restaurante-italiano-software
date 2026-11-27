// Copia este archivo como config.h y completa los valores. config.h NO se sube a git.
#pragma once

#define WIFI_SSID "tu-wifi"
#define WIFI_PASS "tu-clave"

// URL base del backend, SIN "/" final. Es la IP de tu PC en la red WiFi
// (en PowerShell: ipconfig -> "Direccion IPv4"), por ejemplo http://192.168.1.50:8000
#define API_BASE "http://192.168.1.50:8000"

// Nombre de esta terminal: el servidor guarda la conversacion (borrador del pedido) por sesion.
#define SESION_ID "terminal-1"

// Solo si definiste VOZ_DEVICE_KEY en el .env del backend; si no, deja "".
#define DEVICE_KEY ""

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
