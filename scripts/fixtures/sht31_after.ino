/*
 * SHT31-D humidity and temperature sensor driver — ESP32 DevKit (I2C)
 * Datasheet: Sensirion SHT3x-DIS
 *
 * Wiring (sensor pin -> board pin):
 *   VDD    -> 3V3
 *   VSS    -> GND
 *   SDA    -> GPIO21 (I2C SDA)
 *   SCL    -> GPIO22 (I2C SCL)
 *   ADDR   -> GND    (I2C address 0x44; VDD selects 0x45, p.9)
 *   nRESET -> 3V3    (or leave open: internal pull-up, p.9)
 *   ALERT  -> not connected
 */

#include <Wire.h>                          // I2C driver (was missing in the first version)

const int I2C_SDA_PIN = 21;
const int I2C_SCL_PIN = 22;
const uint8_t SHT31_ADDR = 0x44;            // ADDR pin low (table 7, p.9)

// Single-shot measurement, clock stretching disabled, high repeatability (table 8, p.10)
const uint8_t CMD_MEAS_HIGH_MSB = 0x24;
const uint8_t CMD_MEAS_HIGH_LSB = 0x00;
// Soft reset (table 12, p.12)
const uint8_t CMD_SOFT_RESET_MSB = 0x30;
const uint8_t CMD_SOFT_RESET_LSB = 0xA2;

bool sendCommand(uint8_t msb, uint8_t lsb) {
  Wire.beginTransmission(SHT31_ADDR);
  Wire.write(msb);
  Wire.write(lsb);
  return Wire.endTransmission() == 0;
}

// CRC-8: polynomial 0x31 (x^8 + x^5 + x^4 + 1), init 0xFF, no reflection (table 20, p.14)
uint8_t crc8(const uint8_t *data, int len) {
  uint8_t crc = 0xFF;
  for (int i = 0; i < len; i++) {
    crc ^= data[i];
    for (int b = 0; b < 8; b++) {
      crc = (crc & 0x80) ? (uint8_t)((crc << 1) ^ 0x31) : (uint8_t)(crc << 1);
    }
  }
  return crc;
}

bool readMeasurement(float &tempC, float &rh) {
  if (!sendCommand(CMD_MEAS_HIGH_MSB, CMD_MEAS_HIGH_LSB)) return false;
  delay(16);                                 // high repeatability: max 15 ms (table 4, p.7)

  uint8_t d[6];                              // T MSB, T LSB, CRC, RH MSB, RH LSB, CRC (p.11)
  if (Wire.requestFrom(SHT31_ADDR, (uint8_t)6) != 6) return false;
  for (int i = 0; i < 6; i++) d[i] = Wire.read();
  if (crc8(d, 2) != d[2] || crc8(d + 3, 2) != d[5]) return false;

  uint16_t rawT  = ((uint16_t)d[0] << 8) | d[1];
  uint16_t rawRH = ((uint16_t)d[3] << 8) | d[4];
  tempC = -45.0f + 175.0f * (float)rawT / 65535.0f;   // equation 2, p.14
  rh    = 100.0f * (float)rawRH / 65535.0f;           // equation 1, p.14
  return true;
}

void setup() {
  Serial.begin(115200);
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(400000);                     // fast mode supported (p.6)
  sendCommand(CMD_SOFT_RESET_MSB, CMD_SOFT_RESET_LSB);
  delay(2);                                  // soft reset time max 1.5 ms (table 4, p.7)
  Serial.println("SHT31-D ready");
}

void loop() {
  float t, h;
  if (readMeasurement(t, h)) {
    Serial.print("T = "); Serial.print(t, 2); Serial.print(" C   ");
    Serial.print("RH = "); Serial.print(h, 2); Serial.println(" %");
  } else {
    Serial.println("SHT31-D read failed (I2C NACK or CRC mismatch)");
  }
  delay(1000);
}
