import "dotenv/config";
import { createServer } from "http";
import next from "next";
import { setupWebSocketServer } from "./lib/ws";
import { startSweepJob } from "./lib/redis-sweep";
import { logger } from "./lib/logger";

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
