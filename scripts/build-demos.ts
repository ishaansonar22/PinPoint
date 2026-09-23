/**
 * Builds the saved demo results in public/demo/*.json.
 *
 * The specs below are hand-written (what Claude would return); the violations
 * and corrections are computed by the real rules engine so the demo files
 * can never drift from lib/rules.ts.
 *
 *   npm run demos:build
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BOARDS } from "../lib/boards";
import { diffPins } from "../lib/pipeline";
import { checkPins } from "../lib/rules";
import type { BoardId, GenerateResult, PartSpec } from "../lib/types";

const OUT_DIR = path.resolve(process.cwd(), "public", "demo");

// ---------------------------------------------------------------------------
// Demo 1: LED module on ESP32 — Claude first puts the LED on GPIO35, an
// input-only pin. The rules engine flags it; the correction moves it to GPIO26.
// ---------------------------------------------------------------------------

const ledCode = (pin: number, movedNote: string) => `/*
 * LED module driver — ESP32 DevKit
 * Part: single-colour LED module with on-board series resistor
 *
 * Wiring (module pin -> board pin):
 *   S  (signal) -> GPIO${pin}${movedNote}
 *   -  (ground) -> GND
 *
 * The on-board resistor (datasheet p.1: 220 Ω typ.) limits LED current to
 * about 8 mA at 3.3 V, well inside the ESP32's default 12 mA per-pin drive.
 */

const int LED_PIN = ${pin};

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  Serial.println("LED module ready on GPIO${pin}");
}

void loop() {
  // Blink at 1 Hz. Forward voltage ~2.0 V for a red LED (datasheet p.1).
  digitalWrite(LED_PIN, HIGH);
  Serial.println("LED on");
  delay(500);

  digitalWrite(LED_PIN, LOW);
  Serial.println("LED off");
  delay(500);
}
`;

const ledBase: Omit<PartSpec, "pins" | "driver_code"> = {
  part_name: "LED Module (3-pin, red)",
  description:
    "Breakout module with a single 5 mm red LED and a series current-limiting resistor. Drive the S pin high to light the LED.",
  interface: "GPIO",
  operating_voltage: "3.3V to 5V",
  logic_voltage: "3.3V to 5V",
  i2c_address: null,
  init_sequence: [],
  warnings: [
    "The middle '+' pin is not connected on most 3-pin LED modules; leave it floating.",
    "Do not remove the series resistor: the LED would draw more than the 12 mA the ESP32 GPIO can source.",
  ],
  source_pages: {
    part_name: 1,
    description: 1,
    interface: 1,
    operating_voltage: 1,
    logic_voltage: 1,
    pins: 2,
  },
};

const ledBefore: PartSpec = {
  ...ledBase,
  pins: [
    {
      sensor_pin: "S",
      board_pin: "GPIO35",
      direction: "output",
      uses_adc: false,
      note: "LED signal; HIGH turns the LED on.",
    },
    {
      sensor_pin: "-",
      board_pin: "GND",
      direction: "ground",
      uses_adc: false,
      note: "Module ground.",
    },
  ],
  driver_code: ledCode(35, ""),
};

const ledAfter: PartSpec = {
  ...ledBase,
  pins: [
    {
      sensor_pin: "S",
      board_pin: "GPIO26",
      direction: "output",
      uses_adc: false,
      note: "LED signal; HIGH turns the LED on. Moved from GPIO35 because GPIO35 is input-only on the ESP32 and cannot drive a load.",
    },
    ledBefore.pins[1],
  ],
  driver_code: ledCode(26, "   (moved from GPIO35: input-only, cannot drive an LED)"),
};

// ---------------------------------------------------------------------------
// Demo 2: BME280 on ESP32 over I2C — clean result.
// ---------------------------------------------------------------------------

const bme280Code = `/*
 * BME280 temperature / pressure / humidity driver — ESP32 DevKit (I2C)
 * Datasheet: Bosch BST-BME280-DS002
 *
 * Wiring (sensor pin -> board pin):
 *   VDD   -> 3V3
 *   VDDIO -> 3V3
 *   GND   -> GND
 *   SCK   -> GPIO22 (I2C SCL)
 *   SDI   -> GPIO21 (I2C SDA)
 *   CSB   -> 3V3    (high selects the I2C interface, p.31)
 *   SDO   -> GND    (address 0x76; tie to VDDIO for 0x77, p.32)
 *
 * Uses only Wire.h. Compensation formulas are the 32/64-bit integer versions
 * from datasheet section 4.2.3 (p.25-26).
 */

#include <Wire.h>

const int I2C_SDA_PIN = 21;
const int I2C_SCL_PIN = 22;
const uint8_t BME280_ADDR = 0x76;      // SDO tied to GND (p.32)

// Register map (p.27)
const uint8_t REG_CALIB00  = 0x88;     // dig_T1 .. dig_P9, dig_H1 (0x88-0xA1)
const uint8_t REG_ID       = 0xD0;     // chip id, reads 0x60
const uint8_t REG_RESET    = 0xE0;     // write 0xB6 for soft reset
const uint8_t REG_CALIB26  = 0xE1;     // dig_H2 .. dig_H6 (0xE1-0xE7)
const uint8_t REG_CTRL_HUM = 0xF2;
const uint8_t REG_STATUS   = 0xF3;
const uint8_t REG_CTRL_MEAS= 0xF4;
const uint8_t REG_CONFIG   = 0xF5;
const uint8_t REG_DATA     = 0xF7;     // press_msb .. hum_lsb, 8 bytes

// Trimming parameters (table 16, p.24)
uint16_t dig_T1; int16_t dig_T2, dig_T3;
uint16_t dig_P1; int16_t dig_P2, dig_P3, dig_P4, dig_P5, dig_P6, dig_P7, dig_P8, dig_P9;
uint8_t  dig_H1, dig_H3; int16_t dig_H2, dig_H4, dig_H5; int8_t dig_H6;

int32_t t_fine;   // shared between compensation functions (p.25)

void writeReg(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(BME280_ADDR);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

void readRegs(uint8_t reg, uint8_t *buf, uint8_t len) {
  Wire.beginTransmission(BME280_ADDR);
  Wire.write(reg);
  Wire.endTransmission(false);           // repeated start (p.33)
  Wire.requestFrom(BME280_ADDR, len);
  for (uint8_t i = 0; i < len && Wire.available(); i++) buf[i] = Wire.read();
}

uint8_t readReg(uint8_t reg) {
  uint8_t v = 0;
  readRegs(reg, &v, 1);
  return v;
}

void readCalibration() {
  uint8_t c[26];
  readRegs(REG_CALIB00, c, 26);
  dig_T1 = (uint16_t)(c[1] << 8 | c[0]);
  dig_T2 = (int16_t)(c[3] << 8 | c[2]);
  dig_T3 = (int16_t)(c[5] << 8 | c[4]);
  dig_P1 = (uint16_t)(c[7] << 8 | c[6]);
  dig_P2 = (int16_t)(c[9] << 8 | c[8]);
  dig_P3 = (int16_t)(c[11] << 8 | c[10]);
  dig_P4 = (int16_t)(c[13] << 8 | c[12]);
  dig_P5 = (int16_t)(c[15] << 8 | c[14]);
  dig_P6 = (int16_t)(c[17] << 8 | c[16]);
  dig_P7 = (int16_t)(c[19] << 8 | c[18]);
  dig_P8 = (int16_t)(c[21] << 8 | c[20]);
  dig_P9 = (int16_t)(c[23] << 8 | c[22]);
  dig_H1 = c[25];                        // 0xA1

  uint8_t h[7];
  readRegs(REG_CALIB26, h, 7);
  dig_H2 = (int16_t)(h[1] << 8 | h[0]);
  dig_H3 = h[2];
  dig_H4 = (int16_t)((h[3] << 4) | (h[4] & 0x0F));   // 0xE4[7:0] / 0xE5[3:0]
  dig_H5 = (int16_t)((h[5] << 4) | (h[4] >> 4));     // 0xE6[7:0] / 0xE5[7:4]
  dig_H6 = (int8_t)h[6];
}

// Returns temperature in 0.01 degC (p.25)
int32_t compensateT(int32_t adc_T) {
  int32_t var1 = ((((adc_T >> 3) - ((int32_t)dig_T1 << 1))) * ((int32_t)dig_T2)) >> 11;
  int32_t var2 = (((((adc_T >> 4) - ((int32_t)dig_T1)) * ((adc_T >> 4) - ((int32_t)dig_T1))) >> 12) *
                  ((int32_t)dig_T3)) >> 14;
  t_fine = var1 + var2;
  return (t_fine * 5 + 128) >> 8;
}

// Returns pressure in Pa as Q24.8 (divide by 256) (p.25-26)
uint32_t compensateP(int32_t adc_P) {
  int64_t var1 = ((int64_t)t_fine) - 128000;
  int64_t var2 = var1 * var1 * (int64_t)dig_P6;
  var2 = var2 + ((var1 * (int64_t)dig_P5) << 17);
  var2 = var2 + (((int64_t)dig_P4) << 35);
  var1 = ((var1 * var1 * (int64_t)dig_P3) >> 8) + ((var1 * (int64_t)dig_P2) << 12);
  var1 = (((((int64_t)1) << 47) + var1)) * ((int64_t)dig_P1) >> 33;
  if (var1 == 0) return 0;               // avoid divide by zero
  int64_t p = 1048576 - adc_P;
  p = (((p << 31) - var2) * 3125) / var1;
  var1 = (((int64_t)dig_P9) * (p >> 13) * (p >> 13)) >> 25;
  var2 = (((int64_t)dig_P8) * p) >> 19;
  p = ((p + var1 + var2) >> 8) + (((int64_t)dig_P7) << 4);
  return (uint32_t)p;
}

// Returns humidity in %RH as Q22.10 (divide by 1024) (p.26)
uint32_t compensateH(int32_t adc_H) {
  int32_t v = (t_fine - ((int32_t)76800));
  v = (((((adc_H << 14) - (((int32_t)dig_H4) << 20) - (((int32_t)dig_H5) * v)) + ((int32_t)16384)) >> 15) *
       (((((((v * ((int32_t)dig_H6)) >> 10) * (((v * ((int32_t)dig_H3)) >> 11) + ((int32_t)32768))) >> 10) +
          ((int32_t)2097152)) * ((int32_t)dig_H2) + 8192) >> 14));
  v = (v - (((((v >> 15) * (v >> 15)) >> 7) * ((int32_t)dig_H1)) >> 4));
  v = (v < 0 ? 0 : v);
  v = (v > 419430400 ? 419430400 : v);
  return (uint32_t)(v >> 12);
}

void setup() {
  Serial.begin(115200);
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(400000);                 // fast mode supported (p.32)

  uint8_t id = readReg(REG_ID);
  if (id != 0x60) {
    Serial.print("BME280 not found, id=0x"); Serial.println(id, HEX);
    while (true) delay(1000);
  }

  writeReg(REG_RESET, 0xB6);             // soft reset (p.27)
  delay(10);                             // start-up time 2 ms (p.6)
  while (readReg(REG_STATUS) & 0x01) delay(1);   // wait for NVM copy (im_update)

  readCalibration();

  // Init sequence: ctrl_hum must be written before ctrl_meas (p.28)
  writeReg(REG_CTRL_HUM, 0x01);          // humidity oversampling x1
  writeReg(REG_CTRL_MEAS, 0x27);         // temp x1, press x1, normal mode (p.29)
  writeReg(REG_CONFIG, 0xA0);            // t_standby 1000 ms, IIR filter off (p.30)

  Serial.println("BME280 ready");
}

void loop() {
  uint8_t d[8];
  readRegs(REG_DATA, d, 8);              // burst read 0xF7..0xFE (p.31)
  int32_t adc_P = ((int32_t)d[0] << 12) | ((int32_t)d[1] << 4) | (d[2] >> 4);
  int32_t adc_T = ((int32_t)d[3] << 12) | ((int32_t)d[4] << 4) | (d[5] >> 4);
  int32_t adc_H = ((int32_t)d[6] << 8) | d[7];

  float tempC = compensateT(adc_T) / 100.0f;      // call first: sets t_fine
  float pressPa = compensateP(adc_P) / 256.0f;
  float humRH = compensateH(adc_H) / 1024.0f;

  Serial.print("T = "); Serial.print(tempC, 2); Serial.print(" C  ");
  Serial.print("P = "); Serial.print(pressPa / 100.0f, 2); Serial.print(" hPa  ");
  Serial.print("RH = "); Serial.print(humRH, 2); Serial.println(" %");

  delay(1000);
}
`;

const bme280: PartSpec = {
  part_name: "BME280",
  description:
    "Combined digital humidity, pressure and temperature sensor from Bosch Sensortec with I2C and SPI interfaces and on-chip compensation coefficients.",
  interface: "I2C",
  operating_voltage: "1.71V to 3.6V",
  logic_voltage: "1.2V to 3.6V",
  i2c_address: "0x76",
  pins: [
    { sensor_pin: "VDD", board_pin: "3V3", direction: "power", uses_adc: false, note: "Main supply, 1.71–3.6 V." },
    { sensor_pin: "VDDIO", board_pin: "3V3", direction: "power", uses_adc: false, note: "Interface supply for the digital I/O." },
    { sensor_pin: "GND", board_pin: "GND", direction: "ground", uses_adc: false, note: "Ground." },
    { sensor_pin: "SCK", board_pin: "GPIO22", direction: "output", uses_adc: false, note: "I2C clock (SCL). Board default." },
    { sensor_pin: "SDI", board_pin: "GPIO21", direction: "bidirectional", uses_adc: false, note: "I2C data (SDA). Board default. Most breakouts include 10 kΩ pull-ups." },
    { sensor_pin: "CSB", board_pin: "3V3", direction: "power", uses_adc: false, note: "Tie high to select I2C mode; must not be pulled low once I2C is in use." },
    { sensor_pin: "SDO", board_pin: "GND", direction: "ground", uses_adc: false, note: "Sets I2C address LSB: GND = 0x76, VDDIO = 0x77. Do not leave floating." },
  ],
  init_sequence: [
    { register: "0xE0 reset", value: "0xB6", purpose: "Soft reset to power-on state", source_page: 27 },
    { register: "0xF2 ctrl_hum", value: "0x01", purpose: "Humidity oversampling ×1 (write before ctrl_meas)", source_page: 28 },
    { register: "0xF4 ctrl_meas", value: "0x27", purpose: "Temperature ×1, pressure ×1, normal mode", source_page: 29 },
    { register: "0xF5 config", value: "0xA0", purpose: "Standby 1000 ms, IIR filter off", source_page: 30 },
  ],
  driver_code: bme280Code,
  warnings: [
    "The BME280 is a 3.3 V device: never connect VDD or any signal to 5 V.",
    "The SDO pin selects the I2C address (GND → 0x76, VDDIO → 0x77) and must not be left floating.",
    "Humidity settings in ctrl_hum only take effect after the next write to ctrl_meas.",
    "In normal mode with these settings the sensor updates once per second; read all 8 data registers in one burst to avoid mixing samples.",
  ],
  source_pages: {
    part_name: 1,
    description: 1,
    interface: 31,
    operating_voltage: 6,
    logic_voltage: 6,
    i2c_address: 32,
    pins: 36,
    init_sequence: 27,
  },
};

// ---------------------------------------------------------------------------
// Demo 3: MCP3008 on Arduino Uno over SPI — passes, with one warning because
// the chip select was placed on D9 instead of the hardware SS pin D10.
// ---------------------------------------------------------------------------

const mcp3008Code = `/*
 * MCP3008 8-channel 10-bit ADC driver — Arduino Uno (SPI)
 * Datasheet: Microchip DS21295 (MCP3004/MCP3008)
 *
 * Wiring (ADC pin -> board pin):
 *   VDD     -> 5V
 *   VREF    -> 5V     (full-scale reference; 1 LSB = VREF / 1024, p.13)
 *   AGND    -> GND
 *   DGND    -> GND
 *   CLK     -> D13    (hardware SCK)
 *   DOUT    -> D12    (hardware MISO)
 *   DIN     -> D11    (hardware MOSI)
 *   CS/SHDN -> D9     (chip select; D10 kept as OUTPUT so the Uno stays SPI master)
 *   CH0..7  -> your analog signals (0 V .. VREF)
 */

#include <SPI.h>

const int ADC_CS_PIN = 9;
const int HW_SS_PIN  = 10;              // must stay an OUTPUT in master mode

// SPI mode 0,0: clock idle low, data latched on rising edge (p.15).
// Max clock 3.6 MHz at 5 V (p.4); 1 MHz leaves margin on breadboards.
SPISettings mcpSettings(1000000, MSBFIRST, SPI_MODE0);

// Single-ended read of channel 0..7 using 8-bit segments (Figure 6-1, p.21)
uint16_t mcp3008Read(uint8_t channel) {
  channel &= 0x07;
  SPI.beginTransaction(mcpSettings);
  digitalWrite(ADC_CS_PIN, LOW);
  SPI.transfer(0x01);                                   // start bit
  uint8_t hi = SPI.transfer((0x08 | channel) << 4);     // SGL/DIFF=1, D2..D0 = channel
  uint8_t lo = SPI.transfer(0x00);                      // clock out remaining bits
  digitalWrite(ADC_CS_PIN, HIGH);
  SPI.endTransaction();
  return ((uint16_t)(hi & 0x03) << 8) | lo;             // 10-bit result, null bit discarded
}

void setup() {
  Serial.begin(115200);
  pinMode(HW_SS_PIN, OUTPUT);
  digitalWrite(HW_SS_PIN, HIGH);
  pinMode(ADC_CS_PIN, OUTPUT);
  digitalWrite(ADC_CS_PIN, HIGH);                       // idle high = shutdown/deselect (p.14)
  SPI.begin();
  Serial.println("MCP3008 ready");
}

void loop() {
  for (uint8_t ch = 0; ch < 8; ch++) {
    uint16_t raw = mcp3008Read(ch);
    float volts = raw * (5.0f / 1024.0f);               // VREF = 5 V
    Serial.print("CH"); Serial.print(ch); Serial.print(": ");
    Serial.print(raw); Serial.print(" ("); Serial.print(volts, 3); Serial.print(" V)  ");
  }
  Serial.println();
  delay(500);
}
`;

const mcp3008: PartSpec = {
  part_name: "MCP3008",
  description:
    "8-channel, 10-bit successive-approximation ADC with an SPI-compatible serial interface, sampling up to 200 ksps at 5 V.",
  interface: "SPI",
  operating_voltage: "2.7V to 5.5V",
  logic_voltage: "2.7V to 5.5V",
  i2c_address: null,
  pins: [
    { sensor_pin: "VDD", board_pin: "5V", direction: "power", uses_adc: false, note: "Digital and analog supply." },
    { sensor_pin: "VREF", board_pin: "5V", direction: "power", uses_adc: false, note: "Reference sets full-scale input; here 5 V, so 1 LSB ≈ 4.88 mV." },
    { sensor_pin: "AGND", board_pin: "GND", direction: "ground", uses_adc: false, note: "Analog ground." },
    { sensor_pin: "DGND", board_pin: "GND", direction: "ground", uses_adc: false, note: "Digital ground." },
    { sensor_pin: "CLK", board_pin: "D13", direction: "output", uses_adc: false, note: "SPI clock (SCK)." },
    { sensor_pin: "DOUT", board_pin: "D12", direction: "input", uses_adc: false, note: "SPI data out of the ADC (MISO)." },
    { sensor_pin: "DIN", board_pin: "D11", direction: "output", uses_adc: false, note: "SPI data into the ADC (MOSI)." },
    { sensor_pin: "CS/SHDN", board_pin: "D9", direction: "output", uses_adc: false, note: "Active-low chip select; high puts the ADC in shutdown." },
  ],
  init_sequence: [],
  driver_code: mcp3008Code,
  warnings: [
    "Analog inputs must stay between AGND and VREF; add a series resistor or clamp for signals that may exceed 5 V.",
    "Keep the SPI clock at or below 3.6 MHz at 5 V (1.35 MHz at 2.7 V) or conversions lose accuracy.",
    "Place 0.1 µF decoupling capacitors close to VDD and VREF for stable readings.",
  ],
  source_pages: {
    part_name: 1,
    description: 1,
    interface: 15,
    operating_voltage: 2,
    logic_voltage: 4,
    pins: 13,
  },
};

// ---------------------------------------------------------------------------

function clean(board: BoardId, spec: PartSpec): GenerateResult {
  const violations = checkPins(board, spec);
  return {
    board,
    spec,
    violations,
    autoCorrected: false,
    corrections: [],
    originalViolations: violations,
    elapsedMs: 0,
  };
}

function corrected(board: BoardId, before: PartSpec, after: PartSpec): GenerateResult {
  const originalViolations = checkPins(board, before);
  if (!originalViolations.some((v) => v.severity === "error")) {
    throw new Error("Corrected demo must start with at least one error");
  }
  const violations = checkPins(board, after);
  return {
    board,
    spec: after,
    violations,
    autoCorrected: true,
    corrections: diffPins(BOARDS[board], before, after, originalViolations),
    originalViolations,
    elapsedMs: 0,
  };
}

const demos: Record<string, GenerateResult> = {
  "esp32-led-autocorrect": corrected("esp32-devkit", ledBefore, ledAfter),
  "bme280-esp32": clean("esp32-devkit", bme280),
  "mcp3008-uno": clean("arduino-uno", mcp3008),
};

// ---------------------------------------------------------------------------
// Recorded real runs: scripts/recorded/*.json holds GenerateResult objects
// captured from the live API. The spec is kept verbatim; the rules-engine
// output is recomputed so it always reflects the current rules table.
// ---------------------------------------------------------------------------

const RECORDED_DIR = path.resolve(process.cwd(), "scripts", "recorded");
if (existsSync(RECORDED_DIR)) {
  for (const file of readdirSync(RECORDED_DIR).filter((f) => f.endsWith(".json"))) {
    const id = file.replace(/\.json$/, "");
    const recorded = JSON.parse(readFileSync(path.join(RECORDED_DIR, file), "utf8")) as GenerateResult;
    const violations = checkPins(recorded.board, recorded.spec);
    demos[id] = {
      ...recorded,
      violations,
      originalViolations: recorded.autoCorrected ? recorded.originalViolations : violations,
    };
  }
}

mkdirSync(OUT_DIR, { recursive: true });
for (const [id, result] of Object.entries(demos)) {
  const file = path.join(OUT_DIR, `${id}.json`);
  writeFileSync(file, JSON.stringify(result, null, 2) + "\n", "utf8");
  const e = result.violations.filter((v) => v.severity === "error").length;
  const w = result.violations.filter((v) => v.severity === "warning").length;
  console.log(
    `${id}: ${e} error(s), ${w} warning(s), ${result.corrections.length} correction(s)` +
      (result.autoCorrected ? ` [auto-corrected from ${result.originalViolations.length} violation(s)]` : ""),
  );
}
