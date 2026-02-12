export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVELS) {
    return envLevel as LogLevel;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

const minLevel = getMinLogLevel();

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[minLevel];
}

interface LogContext {
  [key: string]: unknown;
}

function formatMessage(
  level: LogLevel,
  component: string,
  message: string,
  context?: LogContext,
): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : "";
  return `${timestamp} [${level.toUpperCase()}] [${component}] ${message}${contextStr}`;
}

export function createLogger(component: string) {
  return {
    debug(message: string, context?: LogContext) {
      if (shouldLog("debug")) {
        console.debug(formatMessage("debug", component, message, context));
      }
    },
    info(message: string, context?: LogContext) {
      if (shouldLog("info")) {
        console.info(formatMessage("info", component, message, context));
      }
    },
    warn(message: string, context?: LogContext) {
      if (shouldLog("warn")) {
        console.warn(formatMessage("warn", component, message, context));
      }
    },
    error(message: string, context?: LogContext) {
      if (shouldLog("error")) {
        console.error(formatMessage("error", component, message, context));
      }
    },
  };
}

export const logger = {
  server: createLogger("Server"),
  ws: createLogger("WebSocket"),
  gameSession: createLogger("GameSession"),
  sweep: createLogger("Sweep"),
  gameBoard: createLogger("GameBoard"),
  e2e: createLogger("E2E"),
};
