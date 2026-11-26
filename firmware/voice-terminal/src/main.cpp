// Terminal de voz para pedidos: mantén el boton, habla, suelta.
//   microfono -> WAV 8 kHz -> backend (Gemini) -> respuesta en la OLED y pitidos.
// El pedido se crea en el servidor cuando el mesero confirma ("eso es todo").
// Ademas la misma placa es LOCALIZADOR: anuncia por Bluetooth (BLE) su etiqueta, que un gateway
// (hardware/gateway/gateway.py) lee para estimar la zona y la distancia del mesero que la lleva, y envia un
// "latido" al backend cada LATIDO_CADA_SEGUNDOS para que la web muestre si esta en linea.
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>

#include "config.h"

#ifndef BLE_ACTIVO
#define BLE_ACTIVO 0
#endif
#ifndef LATIDO_CADA_SEGUNDOS
#define LATIDO_CADA_SEGUNDOS 30
#endif
#if BLE_ACTIVO
#include <NimBLEDevice.h>
#endif

#ifndef MIC_I2S
#define MIC_I2S 0
#endif
#if MIC_I2S
#include "driver/i2s.h"
#endif

static Adafruit_SSD1306 oled(128, 64, &Wire, -1);
static bool hayOled = false;

static const size_t MAX_MUESTRAS = (size_t)SAMPLE_RATE * MAX_REC_SEGUNDOS;
static const size_t WAV_HEADER = 44;
static uint8_t* wav = nullptr;  // 44 bytes de cabecera + muestras int16 little-endian

// ------------------------------------------------------------------- OLED
// La fuente de la OLED no tiene acentos: se transliteran los caracteres UTF-8 mas comunes.
static String aAscii(const String& s) {
  String out;
  for (size_t i = 0; i < s.length(); i++) {
    uint8_t c = s[i];
    if (c < 0x80) { out += (char)c; continue; }
    uint8_t d = (i + 1 < s.length()) ? (uint8_t)s[i + 1] : 0;
    i++;
    if (c == 0xC3) {
      switch (d) {
        case 0xA1: case 0xA0: case 0xA4: out += 'a'; break;
        case 0xA9: case 0xA8: case 0xAB: out += 'e'; break;
        case 0xAD: case 0xAC: case 0xAF: out += 'i'; break;
        case 0xB3: case 0xB2: case 0xB6: out += 'o'; break;
        case 0xBA: case 0xB9: case 0xBC: out += 'u'; break;
        case 0xB1: out += 'n'; break;
        case 0x81: out += 'A'; break; case 0x89: out += 'E'; break;
        case 0x8D: out += 'I'; break; case 0x93: out += 'O'; break;
        case 0x9A: out += 'U'; break; case 0x91: out += 'N'; break;
        default: out += '?';
      }
    } else if (c == 0xC2 && d == 0xBF) out += '?';
    else if (c == 0xC2 && d == 0xA1) out += '!';
    else out += '?';
  }
  return out;
}

static void pantalla(const String& titulo, const String& cuerpo) {
  Serial.printf("[pantalla] %s | %s\n", titulo.c_str(), cuerpo.c_str());
  if (!hayOled) return;
  oled.clearDisplay();
  oled.setTextSize(1);
  oled.setTextColor(SSD1306_WHITE);
  oled.setCursor(0, 0);
  oled.print(aAscii(titulo));
  oled.drawLine(0, 10, 127, 10, SSD1306_WHITE);
  oled.setCursor(0, 14);
  oled.setTextWrap(true);
  String texto = aAscii(cuerpo);
  if (texto.length() > 126) texto = texto.substring(0, 123) + "...";  // 6 lineas x 21 car.
  oled.print(texto);
  oled.display();
}

// ------------------------------------------------------------------ sonido
// Tono cuadrado por el DAC (GPIO25) hacia el amplificador. Bloqueante, solo para avisos cortos.
static void tono(int frecuencia, int ms, int amplitud = 40) {
  if (frecuencia <= 0) { delay(ms); return; }
  const uint32_t mitad = 500000UL / frecuencia;
  const uint32_t fin = millis() + ms;
  while (millis() < fin) {
    dacWrite(PIN_DAC, 128 + amplitud);
    delayMicroseconds(mitad);
    dacWrite(PIN_DAC, 128 - amplitud);
    delayMicroseconds(mitad);
  }
  dacWrite(PIN_DAC, 128);
}

static void sonidoOk() { tono(784, 110); tono(1047, 160); }
static void sonidoPregunta() { tono(660, 140); delay(40); tono(880, 140); }
static void sonidoError() { tono(220, 220); delay(60); tono(180, 300); }
static void sonidoInicio() { tono(1200, 60, 25); }

// -------------------------------------------------------------------- WiFi
static bool conectarWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  pantalla("WiFi", String("Conectando a ") + WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(500);
  return WiFi.status() == WL_CONNECTED;
}

// ------------------------------------------------------------ localizador BLE
#if BLE_ACTIVO
// Anuncia un nombre "TB-<ETIQUETA>" y datos de fabricante 0xFFFF + "TB:<ETIQUETA>". El gateway busca ese
// prefijo; la etiqueta se asigna a un mesero en la pagina "Personal en tiempo real".
static void iniciarBle() {
  const String nombre = String("TB-") + ETIQUETA_BLE;
  NimBLEDevice::init(nombre.c_str());
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);  // potencia maxima: mas alcance y lectura mas estable

  std::string fabricante;
  fabricante += static_cast<char>(0xFF);  // ID de fabricante de pruebas 0xFFFF (little-endian)
  fabricante += static_cast<char>(0xFF);
  fabricante += "TB:";
  fabricante += ETIQUETA_BLE;

  NimBLEAdvertisementData datos;
  datos.setName(nombre.c_str());
  datos.setManufacturerData(fabricante);

  NimBLEAdvertising* anuncio = NimBLEDevice::getAdvertising();
  anuncio->setAdvertisementData(datos);
  anuncio->setScanResponse(false);
  // Cada ~20-40 ms (unidades de 0,625 ms): mas lecturas por segundo para que el gateway promedie.
  anuncio->setMinInterval(0x20);
  anuncio->setMaxInterval(0x40);
  anuncio->start();
  Serial.printf("Localizador BLE activo: %s\n", nombre.c_str());
}
#endif

// ------------------------------------------------------------------ latido
// Avisa al backend que la terminal esta viva (aparece en la tarjeta "Terminal ESP32" de la pagina Voz).
static uint32_t ultimoLatido = 0;

static void enviarLatido() {
  if (WiFi.status() != WL_CONNECTED) return;
  JsonDocument doc;
#if BLE_ACTIVO
  doc["etiqueta"] = ETIQUETA_BLE;
#endif
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["ip"] = WiFi.localIP().toString();
  doc["uptime_s"] = (uint32_t)(millis() / 1000);
  doc["memoria_libre"] = (uint32_t)ESP.getFreeHeap();
  String cuerpo;
  serializeJson(doc, cuerpo);

  HTTPClient http;
  WiFiClientSecure tls;
  http.setTimeout(8000);
  const String url = String(API_BASE) + "/api/v1/voz/latido?sesion=" + SESION_ID;
  if (url.startsWith("https://")) {
    tls.setInsecure();
    http.begin(tls, url);
  } else {
    http.begin(url);
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  const int codigo = http.POST(cuerpo);
  http.end();
  Serial.printf("latido -> HTTP %d (memoria libre %u)\n", codigo, (unsigned)ESP.getFreeHeap());
}

// ------------------------------------------------------------- grabacion WAV
#if MIC_I2S
static void iniciarMicI2S() {
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
  cfg.sample_rate = SAMPLE_RATE;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;  // L/R del INMP441 a GND = canal izquierdo
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 6;
  cfg.dma_buf_len = 256;
  cfg.use_apll = false;
  i2s_driver_install(I2S_NUM_0, &cfg, 0, nullptr);

  i2s_pin_config_t pines = {};
  pines.mck_io_num = I2S_PIN_NO_CHANGE;
  pines.bck_io_num = PIN_MIC_SCK;
  pines.ws_io_num = PIN_MIC_WS;
  pines.data_out_num = I2S_PIN_NO_CHANGE;
  pines.data_in_num = PIN_MIC_SD;
  i2s_set_pin(I2S_NUM_0, &pines);
}
#endif

static void escribirCabecera(uint32_t muestras) {
  const uint32_t datos = muestras * 2;
  const uint32_t tasa = SAMPLE_RATE;
  const uint32_t bytesSeg = tasa * 2;
  auto u32 = [&](size_t o, uint32_t v) { memcpy(wav + o, &v, 4); };
  auto u16 = [&](size_t o, uint16_t v) { memcpy(wav + o, &v, 2); };
  memcpy(wav, "RIFF", 4); u32(4, 36 + datos);
  memcpy(wav + 8, "WAVEfmt ", 8); u32(16, 16);
  u16(20, 1); u16(22, 1); u32(24, tasa); u32(28, bytesSeg); u16(32, 2); u16(34, 16);
  memcpy(wav + 36, "data", 4); u32(40, datos);
}

// Graba mientras el boton siga pulsado (o hasta el maximo). Devuelve cantidad de muestras.
static size_t grabar() {
  int16_t* muestras = (int16_t*)(wav + WAV_HEADER);
  const uint32_t periodoUs = 1000000UL / SAMPLE_RATE;
  size_t n = 0;
  int64_t suma = 0;
  uint32_t siguiente = micros();

  digitalWrite(PIN_LED, HIGH);
#if MIC_I2S
  // INMP441: 24 bits justificados a la izquierda dentro de una palabra de 32. Se baja a 16 bits.
  static int32_t bloque[256];
  size_t bytesLeidos = 0;
  i2s_zero_dma_buffer(I2S_NUM_0);  // descarta lo viejo (incluye el clic del boton)
  while (digitalRead(PIN_BOTON) == LOW && n < MAX_MUESTRAS) {
    if (i2s_read(I2S_NUM_0, bloque, sizeof(bloque), &bytesLeidos, 20 / portTICK_PERIOD_MS) != ESP_OK) continue;
    const size_t k = bytesLeidos / sizeof(int32_t);
    for (size_t i = 0; i < k && n < MAX_MUESTRAS; i++) {
      int v = bloque[i] >> 14;                  // 32 -> 18 bits utiles; la normalizacion ajusta el volumen
      v = constrain(v, -32768, 32767);
      muestras[n++] = (int16_t)v;
      suma += v;
    }
  }
#else
  while (digitalRead(PIN_BOTON) == LOW && n < MAX_MUESTRAS) {
    while ((int32_t)(micros() - siguiente) < 0) { /* espera activa para mantener los 8 kHz */ }
    siguiente += periodoUs;
    int v = analogRead(PIN_MIC);  // 0..4095
    muestras[n++] = (int16_t)v;
    suma += v;
  }
#endif
  digitalWrite(PIN_LED, LOW);
  if (n == 0) return 0;

  // Quita el nivel DC del modulo (~mitad de la escala) y normaliza el volumen.
  const int media = (int)(suma / (int64_t)n);
  int pico = 1;
  for (size_t i = 0; i < n; i++) {
    int v = (int)muestras[i] - media;
    muestras[i] = (int16_t)v;
    if (abs(v) > pico) pico = abs(v);
  }
  float ganancia = 22000.0f / pico;
  if (ganancia > GANANCIA_MAX) ganancia = GANANCIA_MAX;
  for (size_t i = 0; i < n; i++) {
    int v = (int)(muestras[i] * ganancia);
    muestras[i] = (int16_t)constrain(v, -32000, 32000);
  }
  // Diagnostico: pico bajo = el mic casi no capta (revisa el potenciometro del modulo / cables).
  Serial.printf("grabado: %u muestras (%.1f s), DC=%d, pico crudo=%d, ganancia=%.1fx\n",
                (unsigned)n, (float)n / SAMPLE_RATE, media, pico, ganancia);
  return n;
}

// ----------------------------------------------------------------- servidor
static void enviar(size_t muestras) {
  if (!conectarWifi()) {
    pantalla("Sin WiFi", "No pude conectarme al WiFi.");
    sonidoError();
    return;
  }
  escribirCabecera(muestras);

  HTTPClient http;
  WiFiClientSecure tls;
  http.setTimeout(40000);  // el servidor puede tardar hasta ~25 s si Gemini esta saturado
  const String url = String(API_BASE) + "/api/v1/voz/audio?sesion=" + SESION_ID;
  if (url.startsWith("https://")) {
    // El proxy Caddy del proyecto sirve solo HTTPS. Con un dominio publico (Let's Encrypt) conviene
    // validar el certificado con tls.setCACert(...); con el certificado interno de "localhost" no se puede.
    tls.setInsecure();
    http.begin(tls, url);
  } else {
    http.begin(url);
  }
  http.addHeader("Content-Type", "audio/wav");
  http.addHeader("X-Device-Key", DEVICE_KEY);

  pantalla("Procesando...", "Entendiendo el pedido");
  int codigo = http.POST(wav, WAV_HEADER + muestras * 2);
  String cuerpo = codigo > 0 ? http.getString() : "";
  http.end();

  if (codigo <= 0) {
    pantalla("Sin conexion", "No llego al servidor. Revisa API_BASE y que el backend este encendido.");
    Serial.printf("HTTP error %d (%s)\n", codigo, HTTPClient::errorToString(codigo).c_str());
    sonidoError();
    return;
  }

  JsonDocument doc;
  if (deserializeJson(doc, cuerpo)) {
    pantalla("Error", String("Respuesta invalida (HTTP ") + codigo + ")");
    sonidoError();
    return;
  }
  if (codigo != 200) {
    // Contrato de errores del backend: {"error": {"message": "..."}}.
    const char* detalle = doc["error"]["message"].is<const char*>() ? doc["error"]["message"].as<const char*>() : "Error del servidor";
    pantalla(String("Error ") + codigo, detalle);
    sonidoError();
    return;
  }

  const char* oido = doc["transcripcion"] | "";
  const char* mensaje = doc["mensaje"] | "";
  Serial.printf("oido: %s\nrespuesta: %s\n", oido, mensaje);

  if (!doc["pedido"].isNull()) {
    pantalla(String("Cocina: mesa ") + (int)doc["pedido"]["mesa_numero"].as<int>(), mensaje);
    sonidoOk();
  } else if (!doc["pregunta"].isNull()) {
    pantalla("Falta algo...", mensaje);
    sonidoPregunta();
  } else if (doc["cancelar"] | false) {
    pantalla("Cancelado", mensaje);
    sonidoPregunta();
  } else {
    pantalla("Pedido en curso", mensaje);
    sonidoOk();
  }
}

// ------------------------------------------------------------------ arduino
void setup() {
  Serial.begin(115200);
  pinMode(PIN_BOTON, INPUT_PULLUP);
  pinMode(PIN_LED, OUTPUT);
#if MIC_I2S
  iniciarMicI2S();
#else
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_MIC, ADC_11db);  // rango 0..3.3 V
#endif
  dacWrite(PIN_DAC, 128);

  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL);
  hayOled = oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  if (!hayOled) Serial.println("OLED no encontrada (revisa SDA/SCL/direccion). Continuo sin pantalla.");

  wav = (uint8_t*)malloc(WAV_HEADER + MAX_MUESTRAS * 2);
  if (!wav) {
    pantalla("Error", "Sin memoria para el audio");
    while (true) delay(1000);
  }

  pantalla("Terminal de voz", "Iniciando...");
  bool ok = conectarWifi();
  pantalla("Terminal de voz", ok ? "Listo. Manten el boton, habla y suelta." : "Sin WiFi. Revisa config.h");
  if (ok) Serial.println(WiFi.localIP());
#if BLE_ACTIVO
  iniciarBle();  // despues del WiFi: ambos comparten la radio y asi el arranque es mas estable
#endif
  if (ok) enviarLatido();
  ultimoLatido = millis();
  sonidoInicio();
}

void loop() {
  if (digitalRead(PIN_BOTON) != LOW) {
    if (millis() - ultimoLatido >= (uint32_t)LATIDO_CADA_SEGUNDOS * 1000UL) {
      ultimoLatido = millis();
      if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();
      enviarLatido();
    }
    delay(10);
    return;
  }

  delay(25);  // antirrebote
  if (digitalRead(PIN_BOTON) != LOW) return;

  pantalla("Escuchando...", "Habla ahora. Suelta el boton al terminar.");
  sonidoInicio();
  const uint32_t inicio = millis();
  size_t n = grabar();

  if (millis() - inicio < MIN_REC_MS || n < (size_t)(SAMPLE_RATE * MIN_REC_MS / 1000)) {
    pantalla("Muy corto", "Manten el boton mientras hablas.");
    sonidoError();
  } else {
    enviar(n);
  }

  while (digitalRead(PIN_BOTON) == LOW) delay(10);  // espera a que lo suelte
  delay(4000);                                      // deja leer la respuesta
  pantalla("Listo", "Manten el boton, habla y suelta.");
}
