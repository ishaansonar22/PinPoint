# PinPoint compile service
#
# Installs arduino-cli plus the arduino:avr and esp32:esp32 cores at build
# time and warms the build cache, so runtime compiles take seconds.
#
#   docker build -t pinpoint-compile ./compile-service
#   docker run --rm -p 8080:8080 -e COMPILE_SERVICE_TOKEN=change-me pinpoint-compile

FROM node:22-bookworm-slim

ARG ARDUINO_CLI_VERSION=1.5.1
ARG ESP32_INDEX=https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl python3 python3-serial git \
 && rm -rf /var/lib/apt/lists/*

# arduino-cli binary
RUN curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh \
  | BINDIR=/usr/local/bin sh -s ${ARDUINO_CLI_VERSION} \
 && arduino-cli version

# Keep all arduino-cli state in one place, owned by the runtime user.
ENV ARDUINO_DIRECTORIES_DATA=/opt/arduino/data \
    ARDUINO_DIRECTORIES_DOWNLOADS=/opt/arduino/downloads \
    ARDUINO_DIRECTORIES_USER=/opt/arduino/user \
    ARDUINO_BUILD_CACHE_PATH=/opt/arduino/cache \
    ARDUINO_UPDATER_ENABLE_NOTIFICATION=false

# Cores (this layer is large and slow; it is cached between builds)
RUN arduino-cli config init --overwrite --additional-urls ${ESP32_INDEX} \
 && arduino-cli core update-index \
 && arduino-cli core install arduino:avr \
 && arduino-cli core install esp32:esp32 \
 && arduino-cli lib update-index

# Pre-install the most common allowlisted libraries so requests don't wait on downloads.
RUN arduino-cli lib install \
      "Adafruit BusIO" \
      "Adafruit Unified Sensor" \
      "Adafruit BME280 Library" \
      "Adafruit BMP280 Library" \
      "Adafruit SSD1306" \
      "Adafruit GFX Library" \
      "Adafruit NeoPixel" \
      "OneWire" \
      "DallasTemperature" \
      "DHT sensor library" \
      "LiquidCrystal I2C" \
      "ArduinoJson" \
      "RTClib"

# Warm the build cache for both cores with a trivial sketch.
COPY docker/warmup /opt/warmup
RUN arduino-cli compile --fqbn arduino:avr:uno /opt/warmup/blink \
 && arduino-cli compile --fqbn esp32:esp32:esp32 /opt/warmup/blink \
 && rm -rf /opt/warmup/blink/build

# App
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

RUN chown -R node:node /opt/arduino /app
USER node

ENV PORT=8080 \
    COMPILE_TIMEOUT_MS=60000 \
    COMPILE_MAX_CONCURRENT=2
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD curl -fsS http://localhost:8080/health || exit 1

CMD ["node", "dist/index.js"]
