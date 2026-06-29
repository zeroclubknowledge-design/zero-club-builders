import { appendFileSync } from "node:fs";

const logFile = new URL("../localhost.out.log", import.meta.url);
const log = (message) => appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`);

process.on("uncaughtException", (error) => {
  log(`uncaughtException: ${error?.stack || error?.message || String(error)}`);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  log(`unhandledRejection: ${error?.stack || error?.message || String(error)}`);
  process.exit(1);
});

try {
  log("Starting local server launcher");
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: "vite.local.config.ts",
    configLoader: "runner",
    logLevel: "silent",
    server: {
      host: "127.0.0.1"
    }
  });

  await server.listen();
  const address = server.httpServer?.address();
  const port = typeof address === "object" && address ? address.port : 8080;
  log(`Local server running at http://127.0.0.1:${port}/`);
} catch (error) {
  log(error?.stack || error?.message || String(error));
  process.exit(1);
}

setInterval(() => {}, 60_000);
