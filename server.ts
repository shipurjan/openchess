import "dotenv/config";
import { createServer } from "http";
import { readFileSync } from "fs";
import next from "next";
import { setupWebSocketServer } from "./lib/ws";
import { startSweepJob, stopSweepJob } from "./lib/redis-sweep";
import { redis } from "./lib/redis";
import { prisma } from "./lib/prisma";
import { logger } from "./lib/logger";

// In standalone mode, Next.js needs its config injected from the build output.
// In dev mode, the file doesn't exist and this is a no-op.
try {
  const serverFiles = JSON.parse(
    readFileSync(".next/required-server-files.json", "utf-8"),
  );
  (process.env as Record<string, string>).__NEXT_PRIVATE_STANDALONE_CONFIG =
    JSON.stringify(serverFiles.config);
} catch {
  // Expected in dev — required-server-files.json doesn't exist
}

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  const wss = setupWebSocketServer(server);
  startSweepJob();

  let shuttingDown = false;

  function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.server.info(`${signal} received, shutting down`);

    stopSweepJob();
    logger.server.info("Sweep job stopped");

    for (const client of wss.clients) {
      client.close(1001, "Server shutting down");
    }
    logger.server.info("WebSocket connections closed");

    wss.close(() => {
      logger.server.info("WebSocket server closed");

      server.close(async () => {
        logger.server.info("HTTP server closed");

        await redis.quit();
        logger.server.info("Redis disconnected");

        await prisma.$disconnect();
        logger.server.info("Prisma disconnected");

        process.exit(0);
      });
    });
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  server.listen(port, () => {
    logger.server.info("Server ready", {
      url: `http://${hostname}:${port}`,
    });
  });
});
