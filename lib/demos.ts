/**
 * Manifest of the saved demo results in /public/demo. The UI fetches these
 * directly (no API call) so the app can be shown without network access to
 * Anthropic.
 */

export interface DemoEntry {
  id: string;
  title: string;
  subtitle: string;
  /** Public URL of the JSON file. */
  file: string;
}

export const DEMOS: DemoEntry[] = [
  {
    id: "esp32-led-autocorrect",
    title: "LED module on ESP32",
    subtitle: "Auto-corrected: GPIO35 (input-only) → GPIO26",
    file: "/demo/esp32-led-autocorrect.json",
  },
  {
    id: "bme280-esp32",
    title: "BME280 on ESP32",
    subtitle: "I2C temperature / pressure / humidity — all checks pass",
    file: "/demo/bme280-esp32.json",
  },
  {
    id: "mcp3008-uno",
    title: "MCP3008 on Arduino Uno",
    subtitle: "SPI 8-channel ADC — passes with a chip-select warning",
    file: "/demo/mcp3008-uno.json",
  },
  {
    id: "sht31-esp32-compilefix",
    title: "SHT31-D on ESP32",
    subtitle: "Compile-check loop: missing #include <Wire.h> fixed automatically",
    file: "/demo/sht31-esp32-compilefix.json",
  },
  {
    id: "ds18b20-esp32",
    title: "DS18B20 on ESP32 (real run)",
    subtitle: "1-Wire thermometer, bit-banged driver — recorded live output",
    file: "/demo/ds18b20-esp32.json",
  },
  {
    id: "tmp102-uno",
    title: "TMP102 on Arduino Uno (real run)",
    subtitle: "3.3V I2C sensor on a 5V board — level-shifter warning",
    file: "/demo/tmp102-uno.json",
  },
];
