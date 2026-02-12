import pg from "pg";
import Redis from "ioredis";
import { logger } from "@/lib/logger";

const TEST_URL = "postgresql://chess:chess@localhost:5432/chess_test";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let pool: pg.Pool | null = null;
let redis: Redis | null = null;

function getPool() {
  if (!pool) {
    pool = new pg.Pool({ connectionString: TEST_URL });
  }
  return pool;
}

function getRedis() {
  if (!redis) {
    redis = new Redis(REDIS_URL);
  }
  return redis;
}

export async function cleanDatabase() {
  const p = getPool();
  await p.query(`DELETE FROM "Move"`);
  await p.query(`DELETE FROM "Game"`);

  const r = getRedis();
  const keys = await r.keys("game:*");
  if (keys.length > 0) {
    await r.del(...keys);
  }
}

export async function disconnectDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (redis) {
    redis.disconnect();
    redis = null;
  }
}

export async function setExpiredAbandonmentTimer(
  gameId: string,
  disconnectedColor: "white" | "black",
) {
  const r = getRedis();
  const expiredDeadline = Date.now() - 1000;
  const info = { disconnectedColor, deadline: expiredDeadline };
  await r.set(
    `game:${gameId}:abandonment`,
    JSON.stringify(info),
    "EX",
    3600,
  );
}

export async function getAbandonmentInfo(gameId: string) {
  const r = getRedis();
  const data = await r.get(`game:${gameId}:abandonment`);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export async function getGame(id: string) {
  const r = getRedis();
  const redisData = await r.hgetall(`game:${id}`);

  if (redisData && redisData.status) {
    const seatsData = await r.hgetall(`game:${id}:seats`);
    return {
      id,
      status: redisData.status,
      whiteToken: seatsData?.whiteToken ?? null,
      blackToken: seatsData?.blackToken || null,
      result: redisData.result || null,
      currentFen: redisData.currentFen,
      createdAt: new Date(parseInt(redisData.createdAt, 10)),
    };
  }

  const p = getPool();
  const result = await p.query(`SELECT * FROM "Game" WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function getGameMoves(gameId: string) {
  const r = getRedis();
  const redisMoves = await r.lrange(`game:${gameId}:moves`, 0, -1);

  if (redisMoves.length > 0) {
    return redisMoves.map((json) => JSON.parse(json));
  }

  const p = getPool();
  const result = await p.query(
    `SELECT * FROM "Move" WHERE "gameId" = $1 ORDER BY "moveNumber" ASC`,
    [gameId],
  );
  return result.rows;
}

export async function dumpDbState(label: string) {
  const p = getPool();
  const r = getRedis();

  const games = await p.query(`SELECT * FROM "Game"`);
  const moves = await p.query(
    `SELECT * FROM "Move" ORDER BY "moveNumber" ASC`,
  );
  const redisKeys = await r.keys("game:*");

  logger.e2e.debug(`DB State: ${label}`, {
    postgresGames: games.rows,
    postgresMoves: moves.rows,
    redisKeys,
  });
}

export interface CreateGameOptions {
  status?: "WAITING" | "IN_PROGRESS" | "FINISHED" | "ABANDONED";
  result?: "WHITE_WINS" | "BLACK_WINS" | "DRAW" | null;
  withBlackPlayer?: boolean;
}

export async function createGameWithMoves(
  moves: { notation: string; fen: string }[],
  options: CreateGameOptions = {},
) {
  const r = getRedis();
  const id = `test-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const whiteToken = `wtoken-${Math.random().toString(36).slice(2, 11)}`;
  const blackToken = options.withBlackPlayer
    ? `btoken-${Math.random().toString(36).slice(2, 11)}`
    : null;
  const status =
    options.status ?? (moves.length > 0 ? "IN_PROGRESS" : "WAITING");
  const result = options.result ?? null;

  const lastMove = moves[moves.length - 1];
  const currentFen =
    lastMove?.fen ??
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  await r.hset(`game:${id}`, {
    status,
    currentFen,
    result: result ?? "",
    createdAt: String(Date.now()),
  });
  await r.expire(`game:${id}`, 60 * 60);

  await r.hset(`game:${id}:seats`, {
    whiteToken,
    whiteConnected: "0",
    blackToken: blackToken ?? "",
    blackConnected: "0",
  });
  await r.expire(`game:${id}:seats`, 60 * 60);

  const baseTime = Date.now();
  for (let i = 0; i < moves.length; i++) {
    await r.rpush(
      `game:${id}:moves`,
      JSON.stringify({
        moveNumber: i + 1,
        notation: moves[i].notation,
        fen: moves[i].fen,
        createdAt: baseTime + i * 1000,
      }),
    );
  }
  if (moves.length > 0) {
    await r.expire(`game:${id}:moves`, 60 * 60);
  }

  return { id, whiteToken, blackToken };
}
