// Etiqueta BLE de prueba para el sistema Trattoria Bellavista.
// Anuncia por Bluetooth un nombre y un identificador fijo; el gateway de la zona lo detecta.
// Cambia ETIQUETA_ID para cada etiqueta (por ejemplo "M01", "M02").
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEAdvertising.h>

static const char *ETIQUETA_ID = "M01";
// Identificador de fabricante de pruebas (0xFFFF). En producción se usa un ID asignado.
static const uint16_t ID_FABRICANTE = 0xFFFF;

void setup() {
  Serial.begin(115200);
  delay(500);

  String nombre = String("TB-") + ETIQUETA_ID;
  BLEDevice::init(nombre.c_str());

  BLEAdvertisementData datos;
  datos.setName(nombre.c_str());

  // Datos de fabricante: 2 bytes de ID + "TB:" + identificador de la etiqueta.
  String carga;
  carga += static_cast<char>(ID_FABRICANTE & 0xFF);
  carga += static_cast<char>(ID_FABRICANTE >> 8);
  carga += "TB:";
  carga += ETIQUETA_ID;
  datos.setManufacturerData(carga);

  // Potencia de transmision maxima: mas alcance y señal mas estable.
  BLEDevice::setPower(ESP_PWR_LVL_P9);

  BLEAdvertising *anuncio = BLEDevice::getAdvertising();
  anuncio->setAdvertisementData(datos);
  anuncio->setScanResponse(false);
  // Anuncia cada ~20-40 ms (unidades de 0,625 ms): mas lecturas por segundo para promediar.
  anuncio->setMinInterval(0x20);
  anuncio->setMaxInterval(0x40);
  anuncio->start();

  Serial.print("Etiqueta BLE activa: ");
  Serial.println(nombre);
}

void loop() {
  delay(1000);
}
