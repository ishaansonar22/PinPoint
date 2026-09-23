/**
 * Library allowlist.
 *
 * - BUILTIN libraries ship with the board cores and are never installed.
 * - INSTALLABLE libraries (plus anything under an allowed vendor prefix) may
 *   be installed with `arduino-cli lib install`.
 * - Everything else is rejected before any compile happens.
 */

const lower = (s: string) => s.toLowerCase();

/** Libraries bundled with arduino:avr and/or esp32:esp32. */
export const BUILTIN_LIBRARIES = [
  // AVR core
  "Wire",
  "SPI",
  "EEPROM",
  "SoftwareSerial",
  "HID",
  // ESP32 core
  "WiFi",
  "WiFiClientSecure",
  "HTTPClient",
  "HTTPUpdate",
  "WebServer",
  "ESPmDNS",
  "DNSServer",
  "BluetoothSerial",
  "BLE",
  "Preferences",
  "Ticker",
  "Update",
  "FS",
  "SPIFFS",
  "LittleFS",
  "SD",
  "SD_MMC",
  "FFat",
  "ArduinoOTA",
  "ESP32",
  "AsyncUDP",
  "NetworkClientSecure",
  "Network",
  "USB",
  "ESP_I2S",
  "ESP_SR",
  "Zigbee",
  "OpenThread",
  "Insights",
  "RainMaker",
  "SimpleBLE",
  "WiFiProv",
  "PPP",
  "Matter",
];

/** Third-party libraries that may be installed, by exact Library Manager name. */
export const INSTALLABLE_LIBRARIES = [
  "OneWire",
  "DallasTemperature",
  "DHT sensor library",
  "LiquidCrystal",
  "LiquidCrystal I2C",
  "hd44780",
  "Servo",
  "ESP32Servo",
  "Stepper",
  "AccelStepper",
  "ArduinoJson",
  "PubSubClient",
  "FastLED",
  "U8g2",
  "RTClib",
  "MFRC522",
  "IRremote",
  "BH1750",
  "MPU6050",
  "SparkFun BME280",
  "SparkFun MAX3010x Pulse and Proximity Sensor Library",
  "SparkFun TMP102 Breakout",
  "SparkFun u-blox GNSS Arduino Library",
  "TinyGPSPlus",
  "NewPing",
  "Bounce2",
  "PID",
  "Encoder",
  "MAX6675 library",
  "HX711",
  "Keypad",
  "TM1637",
  "LedControl",
  "ClosedCube HDC1080",
  "Sensirion I2C SHT4x",
  "Sensirion I2C SCD4x",
  "Sensirion Core",
  "BME680",
  "BSEC Software Library",
  "VL53L0X",
  "VL53L1X",
  "Seeed Arduino LIS3DHTR",
  "Grove - Barometer Sensor BMP280",
  "MAX30105",
  "INA226",
  "ADS1X15",
  "SSD1306Ascii",
  "PCF8574 library",
  "MCP_ADC",
  "MCP23017",
  "ModbusMaster",
  "ArduinoModbus",
  "ArduinoRS485",
  "Ethernet",
  "PZEM004Tv30",
];

/** Any library whose name starts with one of these is allowed. */
export const ALLOWED_PREFIXES = ["Adafruit ", "SparkFun ", "Sensirion "];

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _.()+\-]{0,79}$/;

const builtinSet = new Set(BUILTIN_LIBRARIES.map(lower));
const installableMap = new Map(INSTALLABLE_LIBRARIES.map((n) => [lower(n), n]));

/** "<Wire.h>" -> "Wire", "  Adafruit BME280 Library " -> "Adafruit BME280 Library". */
export function normalizeLibraryName(raw: string): string {
  return raw
    .trim()
    .replace(/^[<"]/, "")
    .replace(/[>"]$/, "")
    .replace(/\.h$/i, "")
    .trim();
}

export interface LibraryCheck {
  /** Bundled with the core; nothing to install. */
  builtin: string[];
  /** Allowed third-party libraries to install (canonical names). */
  install: string[];
  /** Not on the allowlist. */
  rejected: string[];
}

export function checkLibraries(names: readonly string[]): LibraryCheck {
  const out: LibraryCheck = { builtin: [], install: [], rejected: [] };
  const seen = new Set<string>();
  for (const raw of names) {
    const name = normalizeLibraryName(String(raw));
    if (!name) continue;
    const key = lower(name);
    if (seen.has(key)) continue;
    seen.add(key);

    if (!NAME_RE.test(name)) {
      out.rejected.push(name);
      continue;
    }
    if (builtinSet.has(key)) {
      out.builtin.push(name);
      continue;
    }
    const canonical = installableMap.get(key);
    if (canonical) {
      out.install.push(canonical);
      continue;
    }
    if (ALLOWED_PREFIXES.some((p) => name.toLowerCase().startsWith(p.toLowerCase()))) {
      out.install.push(name);
      continue;
    }
    out.rejected.push(name);
  }
  return out;
}
