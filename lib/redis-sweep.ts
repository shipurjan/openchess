import { redis } from "./redis";
import * as session from "./game-session";
import { logger } from "./logger";

export const SWEEP_INTERVAL_MS = parseInt(
  process.env.SWEEP_INTERVAL_MS ?? String(5 * 60 * 1000),
  10,
);

export const WAITING_GAME_MAX_AGE_MS = parseInt(
  process.env.WAITING_GAME_MAX_AGE_MS ?? String(60 * 60 * 1000),
  10,
);

export const ZOMBIE_ROOM_MAX_DISCONNECT_MS = parseInt(
  process.env.ZOMBIE_ROOM_MAX_DISCONNECT_MS ?? String(10 * 60 * 1000),
  10,
);

export interface SweepResult {
  orphanedGamesDeleted: number;
  zombieRoomsCleaned: number;
  errors: string[];
}

export async function scanGameKeys(): Promise<string[]> {
  const gameIds = new Set<string>();
  let cursor = "0";

  do {
    const [newCursor, keys] = await redis.scan(
      cursor,
      "MATCH",
      "game:*",
      "COUNT",
      100,
    );
    cursor = newCursor;

    for (const key of keys) {
      const parts = key.split(":");
      if (parts.length === 2 && parts[0] === "game") {
        const gameId = parts[1];
        if (session.isValidGameId(gameId)) {
          gameIds.add(gameId);
        }
      }
    }
  } while (cursor !== "0");

  return Array.from(gameIds);
}

export async function sweepOrphanedWaitingGames(): Promise<{
  deleted: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let deleted = 0;
  const now = Date.now();
  const gameIds = await scanGameKeys();

  for (const gameId of gameIds) {
    try {
      const game = await session.getGame(gameId);
      if (!game) continue;
      if (game.status !== "WAITING") continue;

      const age = now - game.createdAt;
      if (age > WAITING_GAME_MAX_AGE_MS) {
        await session.deleteGame(gameId);
        deleted++;
        logger.sweep.info("Deleted orphaned WAITING game", {
          gameId,
          ageMinutes: Math.round(age / 1000 / 60),
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      errors.push(`Failed to process game ${gameId}: ${message}`);
      logger.sweep.error("Error processing orphaned game", {
        gameId,
        error: message,
      });
    }
  }

  return { deleted, errors };
}

export async function sweepZombieRooms(): Promise<{
  cleaned: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let cleaned = 0;
  const gameIds = await scanGameKeys();

  for (const gameId of gameIds) {
    try {
      const game = await session.getGame(gameId);
      if (!game) continue;
      if (game.status !== "IN_PROGRESS") continue;

      const connections = await session.getConnectionStatus(gameId);

      if (!connections.white && !connections.black) {
        const abandonmentInfo =
          await session.getAbandonmentInfo(gameId);

        if (!abandonmentInfo) {
          await session.setAbandonmentTimer(gameId, "white");
          logger.sweep.info("Set abandonment timer for zombie room", {
            gameId,
            reason: "both players disconnected",
          });
        } else {
          const result =
            await session.checkAndProcessAbandonment(gameId);
          if (result.abandoned) {
            cleaned++;
            logger.sweep.info(
              "Processed abandonment for zombie room",
              { gameId, result: result.result },
            );
          }
        }
      } else if (!connections.white || !connections.black) {
        const result =
          await session.checkAndProcessAbandonment(gameId);
        if (result.abandoned) {
          cleaned++;
          logger.sweep.info("Processed abandonment for game", {
            gameId,
            reason: "one player disconnected",
            result: result.result,
          });
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      errors.push(`Failed to process game ${gameId}: ${message}`);
      logger.sweep.error("Error processing zombie room", {
        gameId,
        error: message,
      });
    }
  }

  return { cleaned, errors };
}

export async function sweepFinishedGames(): Promise<{
  cleaned: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let cleaned = 0;
  const gameIds = await scanGameKeys();

  for (const gameId of gameIds) {
    try {
      const game = await session.getGame(gameId);
      if (!game) continue;
      if (game.status !== "FINISHED" && game.status !== "ABANDONED")
        continue;

      const connections = await session.getConnectionStatus(gameId);
      if (connections.white || connections.black) continue;

      await session.archiveAndDeleteGame(gameId);
      cleaned++;
      logger.sweep.info("Archived and deleted finished game", {
        gameId,
        status: game.status,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      errors.push(`Failed to process game ${gameId}: ${message}`);
      logger.sweep.error("Error processing finished game", {
        gameId,
        error: message,
      });
    }
  }

  return { cleaned, errors };
}

export async function runFullSweep(): Promise<SweepResult> {
  logger.sweep.debug("Starting full sweep");
  const startTime = Date.now();

  const [orphanedResult, zombieResult, finishedResult] =
    await Promise.all([
      sweepOrphanedWaitingGames(),
      sweepZombieRooms(),
      sweepFinishedGames(),
    ]);

  const result: SweepResult = {
    orphanedGamesDeleted: orphanedResult.deleted,
    zombieRoomsCleaned: zombieResult.cleaned + finishedResult.cleaned,
    errors: [
      ...orphanedResult.errors,
      ...zombieResult.errors,
      ...finishedResult.errors,
    ],
  };

  const duration = Date.now() - startTime;
  logger.sweep.info("Sweep completed", {
    durationMs: duration,
    orphanedGamesDeleted: result.orphanedGamesDeleted,
    zombieRoomsCleaned: result.zombieRoomsCleaned,
    errorCount: result.errors.length,
  });

  return result;
}

let sweepInterval: ReturnType<typeof setInterval> | null = null;

export function startSweepJob(): void {
  if (sweepInterval) {
    logger.sweep.warn("Sweep job already running");
    return;
  }

  logger.sweep.info("Starting background sweep job", {
    intervalMs: SWEEP_INTERVAL_MS,
  });

  runFullSweep().catch((error) => {
    logger.sweep.error("Error in initial sweep", {
      error: String(error),
    });
  });

  sweepInterval = setInterval(() => {
    runFullSweep().catch((error) => {
      logger.sweep.error("Error in periodic sweep", {
        error: String(error),
      });
    });
  }, SWEEP_INTERVAL_MS);
}

export function stopSweepJob(): void {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
    logger.sweep.info("Stopped background sweep job");
  }
}
