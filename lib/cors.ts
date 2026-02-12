import type { IncomingMessage } from "http";
import { logger } from "./logger";

const CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS;

function parseAllowedOrigins(): Set<string> | null {
  if (!CORS_ALLOWED_ORIGINS) {
    return null;
  }

  const origins = CORS_ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return new Set(origins);
}

const allowedOrigins = parseAllowedOrigins();

export function validateWebSocketOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  const isDev = process.env.NODE_ENV !== "production";

  if (!origin) {
    if (isDev) return true;
    logger.ws.debug("WebSocket upgrade without Origin header", {
      host: req.headers.host,
    });
    return true;
  }

  if (isDev && !allowedOrigins) {
    return true;
  }

  if (!allowedOrigins) {
    logger.ws.warn(
      "WebSocket CORS rejected: no allowed origins configured",
      { origin },
    );
    return false;
  }

  if (allowedOrigins.has(origin)) {
    return true;
  }

  logger.ws.warn("WebSocket CORS rejected: origin not allowed", {
    origin,
    allowedOrigins: Array.from(allowedOrigins),
  });
  return false;
}

export function getCorsHeaders(origin: string | undefined): string {
  if (!origin) return "";

  const isDev = process.env.NODE_ENV !== "production";

  if (isDev && !allowedOrigins) {
    return `Access-Control-Allow-Origin: ${origin}\r\n`;
  }

  if (allowedOrigins?.has(origin)) {
    return `Access-Control-Allow-Origin: ${origin}\r\n`;
  }

  return "";
}
