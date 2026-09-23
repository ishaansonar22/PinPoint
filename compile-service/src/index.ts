import { cliVersion, compileSketch, ensureLibraries, installedCores } from "./arduino.js";
import { BOARDS, config } from "./config.js";
import { createApp } from "./server.js";

async function main() {
  if (!config.token) {
    console.error("[compile-service] COMPILE_SERVICE_TOKEN is not set. Refusing to start without a shared secret.");
    process.exit(1);
  }

  const version = await cliVersion();
  const cores = await installedCores();
  console.log(`[compile-service] arduino-cli ${version || "(unknown version)"} at ${config.arduinoCli}`);
  for (const b of Object.values(BOARDS)) {
    const ok = cores.some((c) => c.toLowerCase() === b.core.toLowerCase());
    console.log(`[compile-service] core ${b.core} (${b.label}): ${ok ? "installed" : "MISSING - compiles for this board will fail"}`);
  }

  const app = createApp({
    token: config.token,
    maxCodeBytes: config.maxCodeBytes,
    maxConcurrent: config.maxConcurrent,
    maxQueue: config.maxQueue,
    compile: compileSketch,
    ensureLibraries,
    info: async () => ({ arduino_cli: version, cores }),
  });

  app.listen(config.port, () => {
    console.log(`[compile-service] listening on :${config.port} (timeout ${config.compileTimeoutMs} ms, max code ${config.maxCodeBytes} bytes)`);
  });
}

main().catch((err) => {
  console.error("[compile-service] fatal:", err);
  process.exit(1);
});
