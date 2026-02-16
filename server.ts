import "dotenv/config";
import { createServer } from "http";
import { readFileSync } from "fs";
import next from "next";
import { setupWebSocketServer } from "./lib/ws";
import { startSweepJob } from "./lib/redis-sweep";
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

  setupWebSocketServer(server);
  startSweepJob();

  server.listen(port, () => {
    logger.server.info("Server ready", {
      url: `http://${hostname}:${port}`,
    });
  });
});
