// Trivial sketch compiled at image build time to warm the core build cache.
#include <Wire.h>
#include <SPI.h>

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Wire.begin();
  SPI.begin();
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
}
