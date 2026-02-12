import { redis } from "./redis";
import { prisma } from "./prisma";
import { Chess } from "chess.js";
import { logger } from "./logger";

export type GameStatus = "WAITING" | "IN_PROGRESS" | "FINISHED" | "ABANDONED";
export type GameResult = "WHITE_WINS" | "BLACK_WINS" | "DRAW" | null;
export type CreatorColor = "white" | "black" | "random";

export interface GameSession {
  id: string;
  status: GameStatus;
  whiteToken: string;
  blackToken: string | null;
  currentFen: string;
  result: GameResult;
  isPublic: boolean;
  createdAt: number;
  timeInitialMs: number;
  timeIncrementMs: number;
  whiteTimeMs: number;
  blackTimeMs: number;
  lastMoveAt: number;
  creatorColor: CreatorColor;
}

export interface SeatsInfo {
  whiteToken: string;
  whiteConnected: boolean;
  blackToken: string | null;
  blackConnected: boolean;
}

export interface GameMove {
  moveNumber: number;
  notation: string;
  fen: string;
  createdAt: number;
}

export interface PublicGame {
  id: string;
  createdAt: number;
  status: GameStatus;
  timeInitialMs: number;
  timeIncrementMs: number;
}

export interface GetMovesResult {
  moves: GameMove[];
  corruptedIndices: number[];
}

export interface DeductTimeResult {
  whiteTimeMs: number;
  blackTimeMs: number;
  timedOut: boolean;
  loser?: "white" | "black";
}

export interface AbandonmentInfo {
  disconnectedColor: "white" | "black";
  deadline: number;
}

export interface ReplayMovesResult {
  chess: Chess;
  validMoves: GameMove[];
  corruptedMoves: Array<{ index: number; move: GameMove; error: string }>;
  lastValidFen: string;
}

export interface CreateGameOptions {
  isPublic?: boolean;
  creatorIP?: string;
  timeInitialMs?: number;
  timeIncrementMs?: number;
  creatorColor?: CreatorColor;
}

// Constants
const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const TTL_WAITING = 60 * 60;
const TTL_IN_PROGRESS = 24 * 60 * 60;
const TTL_FINISHED = 60 * 60;
const PUBLIC_GAMES_KEY = "public_games";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IPV4_REGEX =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const IPV6_REGEX = /^[0-9a-f:]+$/i;

export const MAX_ACTIVE_GAMES_PER_IP = parseInt(
  process.env.MAX_ACTIVE_GAMES_PER_IP ?? "5",
  10,
);

export const ABANDONMENT_TIMEOUT_SECONDS = parseInt(
  process.env.ABANDONMENT_TIMEOUT_SECONDS ?? "300",
  10,
);

// Validation

export function isValidGameId(gameId: unknown): gameId is string {
  if (typeof gameId !== "string") return false;
  if (gameId.length === 0 || gameId.length > 36) return false;
  return UUID_REGEX.test(gameId);
}

export function isValidIP(ip: unknown): ip is string {
  if (typeof ip !== "string") return false;
  if (ip.length === 0 || ip.length > 45) return false;
  if (IPV4_REGEX.test(ip)) return true;
  if (IPV6_REGEX.test(ip) && ip.length >= 2) return true;
  return false;
}

export function sanitizeIPForRedisKey(ip: string): string {
  if (!isValidIP(ip)) return "unknown";
  return ip.replace(/:/g, "_");
}

// Redis key helpers

function gameKey(gameId: string) {
  return `game:${gameId}`;
}

function ipGamesKey(ip: string) {
  return `ip_games:${sanitizeIPForRedisKey(ip)}`;
}

function seatsKey(gameId: string) {
  return `game:${gameId}:seats`;
}

function movesKey(gameId: string) {
  return `game:${gameId}:moves`;
}

function drawOfferKey(gameId: string) {
  return `game:${gameId}:drawOffer`;
}

function rematchOfferKey(gameId: string) {
  return `game:${gameId}:rematchOffer`;
}

function abandonmentKey(gameId: string) {
  return `game:${gameId}:abandonment`;
}

function spectatorCountKey(gameId: string) {
  return `game:${gameId}:spectators`;
}

async function refreshAllGameTTLs(
  gameId: string,
  ttl: number,
): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.expire(gameKey(gameId), ttl);
  pipeline.expire(seatsKey(gameId), ttl);
  pipeline.expire(movesKey(gameId), ttl);
  await pipeline.exec();
}

// IP tracking

export async function getActiveGameCountForIP(ip: string): Promise<number> {
  const gameIds = await redis.smembers(ipGamesKey(ip));
  if (gameIds.length === 0) return 0;

  let activeCount = 0;
  const staleGameIds: string[] = [];

  for (const gameId of gameIds) {
    const status = await redis.hget(gameKey(gameId), "status");
    if (status === "WAITING" || status === "IN_PROGRESS") {
      activeCount++;
    } else {
      staleGameIds.push(gameId);
    }
  }

  if (staleGameIds.length > 0) {
    await redis.srem(ipGamesKey(ip), ...staleGameIds);
  }

  return activeCount;
}

export async function canCreateGame(
  ip: string,
): Promise<{ allowed: boolean; activeCount: number; limit: number }> {
  const activeCount = await getActiveGameCountForIP(ip);
  return {
    allowed: activeCount < MAX_ACTIVE_GAMES_PER_IP,
    activeCount,
    limit: MAX_ACTIVE_GAMES_PER_IP,
  };
}

export async function trackGameForIP(
  ip: string,
  gameId: string,
): Promise<void> {
  await redis.sadd(ipGamesKey(ip), gameId);
  await redis.expire(ipGamesKey(ip), TTL_IN_PROGRESS);
}

export async function untrackGameForIP(
  ip: string,
  gameId: string,
): Promise<void> {
  await redis.srem(ipGamesKey(ip), gameId);
}

// Game CRUD

export async function createGame(
  options: CreateGameOptions = {},
): Promise<{ gameId: string; whiteToken: string }> {
  const gameId = crypto.randomUUID();
  const whiteToken = crypto.randomUUID();
  const isPublic = options.isPublic ?? false;
  const creatorIP = options.creatorIP;
  const timeInitialMs = options.timeInitialMs ?? 0;
  const timeIncrementMs = options.timeIncrementMs ?? 0;
  const creatorColor = options.creatorColor ?? "white";

  const session: Record<string, string> = {
    status: "WAITING",
    currentFen: INITIAL_FEN,
    result: "",
    isPublic: isPublic ? "1" : "0",
    createdAt: String(Date.now()),
    timeInitialMs: String(timeInitialMs),
    timeIncrementMs: String(timeIncrementMs),
    whiteTimeMs: "0",
    blackTimeMs: "0",
    lastMoveAt: "0",
    creatorColor,
  };

  if (creatorIP) {
    session.creatorIP = creatorIP;
  }

  const seats: Record<string, string> = {
    whiteToken,
    whiteConnected: "0",
    blackToken: "",
    blackConnected: "0",
  };

  await redis.hset(gameKey(gameId), session);
  await redis.hset(seatsKey(gameId), seats);
  await redis.expire(gameKey(gameId), TTL_WAITING);
  await redis.expire(seatsKey(gameId), TTL_WAITING);

  if (creatorIP) {
    await trackGameForIP(creatorIP, gameId);
  }

  if (isPublic) {
    await redis.zadd(PUBLIC_GAMES_KEY, Date.now(), gameId);
    await redis.expire(PUBLIC_GAMES_KEY, TTL_IN_PROGRESS);
  }

  return { gameId, whiteToken };
}

export async function getGame(gameId: string): Promise<GameSession | null> {
  if (!isValidGameId(gameId)) return null;

  const data = await redis.hgetall(gameKey(gameId));
  if (!data || !data.status) return null;

  const seats = await getSeats(gameId);

  return {
    id: gameId,
    status: data.status as GameStatus,
    whiteToken: seats?.whiteToken ?? "",
    blackToken: seats?.blackToken || null,
    currentFen: data.currentFen || INITIAL_FEN,
    result: (data.result || null) as GameResult,
    isPublic: data.isPublic === "1",
    createdAt: parseInt(data.createdAt, 10),
    timeInitialMs: parseInt(data.timeInitialMs || "0", 10),
    timeIncrementMs: parseInt(data.timeIncrementMs || "0", 10),
    whiteTimeMs: parseInt(data.whiteTimeMs || "0", 10),
    blackTimeMs: parseInt(data.blackTimeMs || "0", 10),
    lastMoveAt: parseInt(data.lastMoveAt || "0", 10),
    creatorColor: (data.creatorColor as CreatorColor) || "white",
  };
}

export async function getSeats(gameId: string): Promise<SeatsInfo | null> {
  if (!isValidGameId(gameId)) return null;

  const data = await redis.hgetall(seatsKey(gameId));
  if (!data || !data.whiteToken) return null;

  return {
    whiteToken: data.whiteToken,
    whiteConnected: data.whiteConnected === "1",
    blackToken: data.blackToken || null,
    blackConnected: data.blackConnected === "1",
  };
}

export async function joinGame(
  gameId: string,
): Promise<{ token: string; role: "white" | "black" } | null> {
  const game = await getGame(gameId);
  if (!game) return null;
  if (game.status !== "WAITING" || game.blackToken) return null;

  const joinerToken = crypto.randomUUID();

  let resolvedCreatorColor: "white" | "black" = "white";
  if (game.creatorColor === "random") {
    resolvedCreatorColor = Math.random() < 0.5 ? "white" : "black";
  } else {
    resolvedCreatorColor = game.creatorColor;
  }

  const swapColors = resolvedCreatorColor === "black" ? "1" : "0";

  const script = `
    local gameKey = KEYS[1]
    local seatsKey = KEYS[2]
    local joinerToken = ARGV[1]
    local ttl = tonumber(ARGV[2])
    local nowMs = ARGV[3]
    local swapColors = ARGV[4]

    local status = redis.call('HGET', gameKey, 'status')
    local existingBlack = redis.call('HGET', seatsKey, 'blackToken')

    if status ~= 'WAITING' then
      return nil
    end
    if existingBlack and existingBlack ~= '' then
      return nil
    end

    redis.call('HSET', gameKey, 'status', 'IN_PROGRESS')

    if swapColors == '1' then
      local creatorToken = redis.call('HGET', seatsKey, 'whiteToken')
      redis.call('HSET', seatsKey, 'whiteToken', joinerToken, 'whiteConnected', '1')
      redis.call('HSET', seatsKey, 'blackToken', creatorToken, 'blackConnected', '0')
    else
      redis.call('HSET', seatsKey, 'blackToken', joinerToken, 'blackConnected', '1')
    end

    local timeInitialMs = tonumber(redis.call('HGET', gameKey, 'timeInitialMs') or '0')
    if timeInitialMs > 0 then
      redis.call('HSET', gameKey, 'whiteTimeMs', tostring(timeInitialMs))
      redis.call('HSET', gameKey, 'blackTimeMs', tostring(timeInitialMs))
      redis.call('HSET', gameKey, 'lastMoveAt', nowMs)
    end

    redis.call('EXPIRE', gameKey, ttl)
    redis.call('EXPIRE', seatsKey, ttl)
    return 'OK'
  `;

  const result = await redis.eval(
    script,
    2,
    gameKey(gameId),
    seatsKey(gameId),
    joinerToken,
    TTL_IN_PROGRESS,
    String(Date.now()),
    swapColors,
  );

  if (result !== "OK") return null;

  const joinerRole: "white" | "black" =
    resolvedCreatorColor === "black" ? "white" : "black";
  return { token: joinerToken, role: joinerRole };
}

export async function getPlayerRole(
  gameId: string,
  token: string | undefined,
): Promise<"white" | "black" | "spectator"> {
  if (!token) return "spectator";
  if (!isValidGameId(gameId)) return "spectator";

  const seats = await getSeats(gameId);
  if (!seats) return "spectator";

  if (token === seats.whiteToken) return "white";
  if (token === seats.blackToken) return "black";
  return "spectator";
}

// Public games

export async function getPublicGames(
  limit: number = 20,
): Promise<PublicGame[]> {
  const gameIds = await redis.zrevrange(
    PUBLIC_GAMES_KEY,
    0,
    limit - 1,
    "WITHSCORES",
  );

  const games: PublicGame[] = [];
  for (let i = 0; i < gameIds.length; i += 2) {
    const id = gameIds[i];
    const score = gameIds[i + 1];

    const game = await getGame(id);
    if (
      game &&
      game.isPublic &&
      (game.status === "WAITING" || game.status === "IN_PROGRESS")
    ) {
      games.push({
        id,
        createdAt: parseInt(score, 10),
        status: game.status,
        timeInitialMs: game.timeInitialMs,
        timeIncrementMs: game.timeIncrementMs,
      });
    } else {
      await redis.zrem(PUBLIC_GAMES_KEY, id);
    }
  }

  return games;
}

// Moves

export async function getMoves(gameId: string): Promise<GameMove[]> {
  if (!isValidGameId(gameId)) return [];

  const result = await getMovesWithRecovery(gameId);
  return result.moves;
}

export async function getMoveCount(gameId: string): Promise<number> {
  if (!isValidGameId(gameId)) return 0;

  return await redis.llen(movesKey(gameId));
}

export async function getMovesWithRecovery(
  gameId: string,
): Promise<GetMovesResult> {
  if (!isValidGameId(gameId)) return { moves: [], corruptedIndices: [] };

  const movesJson = await redis.lrange(movesKey(gameId), 0, -1);
  const moves: GameMove[] = [];
  const corruptedIndices: number[] = [];

  for (let i = 0; i < movesJson.length; i++) {
    try {
      const move = JSON.parse(movesJson[i]) as GameMove;
      if (
        typeof move.moveNumber === "number" &&
        typeof move.notation === "string" &&
        typeof move.fen === "string" &&
        typeof move.createdAt === "number"
      ) {
        moves.push(move);
      } else {
        logger.gameSession.error("Move has invalid structure", {
          gameId,
          moveIndex: i,
          rawMove: movesJson[i],
        });
        corruptedIndices.push(i);
      }
    } catch (error) {
      logger.gameSession.error("Failed to parse move", {
        gameId,
        moveIndex: i,
        rawMove: movesJson[i],
        error: String(error),
      });
      corruptedIndices.push(i);
    }
  }

  return { moves, corruptedIndices };
}

export async function addMove(
  gameId: string,
  move: GameMove,
): Promise<void> {
  if (!isValidGameId(gameId)) return;

  await redis.rpush(movesKey(gameId), JSON.stringify(move));
  await redis.hset(gameKey(gameId), "currentFen", move.fen);
  await refreshAllGameTTLs(gameId, TTL_IN_PROGRESS);
}

// Time control

export async function deductTimeAndMove(
  gameId: string,
  moverColor: "white" | "black",
  move: GameMove,
  nowMs: number,
): Promise<DeductTimeResult> {
  const timeField =
    moverColor === "white" ? "whiteTimeMs" : "blackTimeMs";

  const script = `
    local gameKey = KEYS[1]
    local movesKey = KEYS[2]
    local timeField = ARGV[1]
    local moveJson = ARGV[2]
    local fen = ARGV[3]
    local nowMs = tonumber(ARGV[4])
    local incrementMs = tonumber(ARGV[5])
    local moverColor = ARGV[6]

    local lastMoveAt = tonumber(redis.call('HGET', gameKey, 'lastMoveAt') or '0')
    local remaining = tonumber(redis.call('HGET', gameKey, timeField) or '0')

    local elapsed = nowMs - lastMoveAt
    remaining = remaining - elapsed

    if remaining <= 0 then
      return {0, 0, 1, moverColor}
    end

    remaining = remaining + incrementMs

    redis.call('HSET', gameKey, timeField, tostring(remaining))
    redis.call('HSET', gameKey, 'lastMoveAt', tostring(nowMs))
    redis.call('HSET', gameKey, 'currentFen', fen)
    redis.call('RPUSH', movesKey, moveJson)

    local whiteTimeMs = tonumber(redis.call('HGET', gameKey, 'whiteTimeMs') or '0')
    local blackTimeMs = tonumber(redis.call('HGET', gameKey, 'blackTimeMs') or '0')

    return {whiteTimeMs, blackTimeMs, 0, ''}
  `;

  const result = (await redis.eval(
    script,
    2,
    gameKey(gameId),
    movesKey(gameId),
    timeField,
    JSON.stringify(move),
    move.fen,
    String(nowMs),
    String((await getGame(gameId))?.timeIncrementMs ?? 0),
    moverColor,
  )) as [number, number, number, string];

  await refreshAllGameTTLs(gameId, TTL_IN_PROGRESS);

  return {
    whiteTimeMs: Number(result[0]),
    blackTimeMs: Number(result[1]),
    timedOut: Number(result[2]) === 1,
    loser:
      Number(result[2]) === 1
        ? (result[3] as "white" | "black")
        : undefined,
  };
}

export async function checkTimeout(
  gameId: string,
  activeColor: "white" | "black",
  nowMs: number,
): Promise<{ timedOut: boolean; remainingMs: number }> {
  const data = await redis.hgetall(gameKey(gameId));
  if (!data || !data.lastMoveAt) return { timedOut: false, remainingMs: 0 };

  const timeField =
    activeColor === "white" ? "whiteTimeMs" : "blackTimeMs";
  const remaining = parseInt(data[timeField] || "0", 10);
  const lastMoveAt = parseInt(data.lastMoveAt, 10);
  const elapsed = nowMs - lastMoveAt;
  const currentRemaining = remaining - elapsed;

  return {
    timedOut: currentRemaining <= 0,
    remainingMs: Math.max(0, currentRemaining),
  };
}

// Game state updates

export async function setGameResult(
  gameId: string,
  result: "WHITE_WINS" | "BLACK_WINS" | "DRAW",
): Promise<void> {
  if (!isValidGameId(gameId)) return;

  await redis.hset(gameKey(gameId), "status", "FINISHED", "result", result);
  await refreshAllGameTTLs(gameId, TTL_FINISHED);
}

export async function setGameAbandoned(
  gameId: string,
  result: "WHITE_WINS" | "BLACK_WINS",
): Promise<void> {
  if (!isValidGameId(gameId)) return;

  await redis.hset(
    gameKey(gameId),
    "status",
    "ABANDONED",
    "result",
    result,
  );
  await refreshAllGameTTLs(gameId, TTL_FINISHED);
}

// Connection tracking

export async function setPlayerConnected(
  gameId: string,
  color: "white" | "black",
  connected: boolean,
): Promise<void> {
  if (!isValidGameId(gameId)) return;

  const field = color === "white" ? "whiteConnected" : "blackConnected";
  await redis.hset(seatsKey(gameId), field, connected ? "1" : "0");
  await refreshAllGameTTLs(gameId, TTL_IN_PROGRESS);
}

export async function getConnectionStatus(
  gameId: string,
): Promise<{ white: boolean; black: boolean }> {
  if (!isValidGameId(gameId)) return { white: false, black: false };

  const seats = await getSeats(gameId);
  return {
    white: seats?.whiteConnected ?? false,
    black: seats?.blackConnected ?? false,
  };
}

// Spectators

export async function incrementSpectators(gameId: string): Promise<void> {
  await redis.incr(spectatorCountKey(gameId));
  await redis.expire(spectatorCountKey(gameId), TTL_IN_PROGRESS);
}

export async function decrementSpectators(gameId: string): Promise<void> {
  const count = await redis.decr(spectatorCountKey(gameId));
  if (count < 0)
    await redis.set(spectatorCountKey(gameId), "0", "EX", TTL_IN_PROGRESS);
}

export async function getSpectatorCount(gameId: string): Promise<number> {
  const count = await redis.get(spectatorCountKey(gameId));
  return Math.max(0, parseInt(count ?? "0", 10));
}

export async function getRoomInfo(
  gameId: string,
): Promise<{ players: number; spectators: number }> {
  const connections = await getConnectionStatus(gameId);
  const players =
    (connections.white ? 1 : 0) + (connections.black ? 1 : 0);
  const spectators = await getSpectatorCount(gameId);
  return { players, spectators };
}

// Draw offers

export async function setDrawOffer(
  gameId: string,
  color: "white" | "black",
): Promise<void> {
  if (!isValidGameId(gameId)) return;

  await redis.set(drawOfferKey(gameId), color, "EX", 60 * 60);
}

export async function getDrawOffer(
  gameId: string,
): Promise<"white" | "black" | null> {
  if (!isValidGameId(gameId)) return null;

  const offer = await redis.get(drawOfferKey(gameId));
  return offer as "white" | "black" | null;
}

export async function clearDrawOffer(gameId: string): Promise<void> {
  if (!isValidGameId(gameId)) return;

  await redis.del(drawOfferKey(gameId));
}

// Rematch offers

export async function setRematchOffer(
  gameId: string,
  color: "white" | "black",
): Promise<void> {
  if (!isValidGameId(gameId)) return;

  await redis.set(rematchOfferKey(gameId), color, "EX", 60 * 60);
}

export async function getRematchOffer(
  gameId: string,
): Promise<"white" | "black" | null> {
  if (!isValidGameId(gameId)) return null;

  const offer = await redis.get(rematchOfferKey(gameId));
  return offer as "white" | "black" | null;
}

export async function clearRematchOffer(gameId: string): Promise<void> {
  if (!isValidGameId(gameId)) return;

  await redis.del(rematchOfferKey(gameId));
}

// Abandonment

export async function setAbandonmentTimer(
  gameId: string,
  disconnectedColor: "white" | "black",
): Promise<void> {
  if (!isValidGameId(gameId)) return;

  const deadline = Date.now() + ABANDONMENT_TIMEOUT_SECONDS * 1000;
  const info: AbandonmentInfo = { disconnectedColor, deadline };
  await redis.set(
    abandonmentKey(gameId),
    JSON.stringify(info),
    "EX",
    ABANDONMENT_TIMEOUT_SECONDS + 60,
  );
}

export async function setAbandonmentTimerWithDeadline(
  gameId: string,
  disconnectedColor: "white" | "black",
  deadline: number,
): Promise<void> {
  if (!isValidGameId(gameId)) return;

  const info: AbandonmentInfo = { disconnectedColor, deadline };
  await redis.set(
    abandonmentKey(gameId),
    JSON.stringify(info),
    "EX",
    ABANDONMENT_TIMEOUT_SECONDS + 60,
  );
}

export async function getAbandonmentInfo(
  gameId: string,
): Promise<AbandonmentInfo | null> {
  if (!isValidGameId(gameId)) return null;

  const data = await redis.get(abandonmentKey(gameId));
  if (!data) return null;
  try {
    return JSON.parse(data) as AbandonmentInfo;
  } catch {
    return null;
  }
}

export async function clearAbandonmentTimer(
  gameId: string,
): Promise<void> {
  if (!isValidGameId(gameId)) return;

  await redis.del(abandonmentKey(gameId));
}

export async function checkAndProcessAbandonment(
  gameId: string,
): Promise<{ abandoned: boolean; result?: "WHITE_WINS" | "BLACK_WINS" }> {
  if (!isValidGameId(gameId)) return { abandoned: false };

  const info = await getAbandonmentInfo(gameId);
  if (!info) return { abandoned: false };

  if (Date.now() >= info.deadline) {
    const result =
      info.disconnectedColor === "white" ? "BLACK_WINS" : "WHITE_WINS";
    await setGameAbandoned(gameId, result);
    await clearAbandonmentTimer(gameId);
    await archiveGame(gameId);
    return { abandoned: true, result };
  }

  return { abandoned: false };
}

// Game lifecycle

export async function deleteGame(gameId: string): Promise<void> {
  if (!isValidGameId(gameId)) return;

  await redis.del(
    gameKey(gameId),
    seatsKey(gameId),
    movesKey(gameId),
    drawOfferKey(gameId),
    rematchOfferKey(gameId),
    abandonmentKey(gameId),
    spectatorCountKey(gameId),
  );
  await redis.zrem(PUBLIC_GAMES_KEY, gameId);
}

export async function createRematchGame(
  originalWhiteToken: string,
  originalBlackToken: string,
  options?: { timeInitialMs?: number; timeIncrementMs?: number },
): Promise<{
  gameId: string;
  newWhiteToken: string;
  newBlackToken: string;
}> {
  const gameId = crypto.randomUUID();
  const newWhiteToken = crypto.randomUUID();
  const newBlackToken = crypto.randomUUID();
  const timeInitialMs = options?.timeInitialMs ?? 0;
  const timeIncrementMs = options?.timeIncrementMs ?? 0;
  const now = Date.now();

  const session: Record<string, string> = {
    status: "IN_PROGRESS",
    currentFen: INITIAL_FEN,
    result: "",
    createdAt: String(now),
    timeInitialMs: String(timeInitialMs),
    timeIncrementMs: String(timeIncrementMs),
    whiteTimeMs: String(timeInitialMs),
    blackTimeMs: String(timeInitialMs),
    lastMoveAt: timeInitialMs > 0 ? String(now) : "0",
  };

  const seats: Record<string, string> = {
    whiteToken: newWhiteToken,
    whiteConnected: "1",
    blackToken: newBlackToken,
    blackConnected: "1",
  };

  await redis.hset(gameKey(gameId), session);
  await redis.hset(seatsKey(gameId), seats);
  await redis.expire(gameKey(gameId), TTL_IN_PROGRESS);
  await redis.expire(seatsKey(gameId), TTL_IN_PROGRESS);

  return { gameId, newWhiteToken, newBlackToken };
}

// Archival

export async function archiveGame(gameId: string): Promise<void> {
  if (!isValidGameId(gameId)) return;

  const game = await getGame(gameId);
  if (!game || (game.status !== "FINISHED" && game.status !== "ABANDONED"))
    return;

  const moves = await getMoves(gameId);

  const existing = await prisma.game.findUnique({
    where: { id: gameId },
  });
  if (existing) return;

  await prisma.game.create({
    data: {
      id: gameId,
      status: game.status,
      result: game.result as
        | "WHITE_WINS"
        | "BLACK_WINS"
        | "DRAW"
        | undefined,
      whiteToken: game.whiteToken,
      blackToken: game.blackToken,
      isPublic: game.isPublic,
      timeInitialMs: game.timeInitialMs,
      timeIncrementMs: game.timeIncrementMs,
      createdAt: new Date(game.createdAt),
      moves: {
        create: moves.map((m) => ({
          moveNumber: m.moveNumber,
          notation: m.notation,
          fen: m.fen,
          createdAt: new Date(m.createdAt),
        })),
      },
    },
  });
}

export async function archiveAndDeleteGame(
  gameId: string,
): Promise<void> {
  if (!isValidGameId(gameId)) return;

  await archiveGame(gameId);
  await deleteGame(gameId);
}

// Move replay

export function replayMoves(moves: GameMove[]): ReplayMovesResult {
  const chess = new Chess();
  const validMoves: GameMove[] = [];
  const corruptedMoves: Array<{
    index: number;
    move: GameMove;
    error: string;
  }> = [];

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    try {
      const result = chess.move(move.notation);
      if (result) {
        validMoves.push(move);
      } else {
        corruptedMoves.push({
          index: i,
          move,
          error: "Move returned null",
        });
        break;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.gameSession.error("Failed to replay move", {
        moveIndex: i,
        notation: move.notation,
        error: errorMessage,
      });
      corruptedMoves.push({ index: i, move, error: errorMessage });
      break;
    }
  }

  return {
    chess,
    validMoves,
    corruptedMoves,
    lastValidFen: chess.fen(),
  };
}

export async function getGameStateWithRecovery(
  gameId: string,
): Promise<{
  game: GameSession | null;
  replayResult: ReplayMovesResult | null;
  hasCorruption: boolean;
}> {
  if (!isValidGameId(gameId)) {
    return { game: null, replayResult: null, hasCorruption: false };
  }

  const game = await getGame(gameId);
  if (!game) {
    return { game: null, replayResult: null, hasCorruption: false };
  }

  const { moves, corruptedIndices } = await getMovesWithRecovery(gameId);
  const replayResult = replayMoves(moves);

  const hasCorruption =
    corruptedIndices.length > 0 ||
    replayResult.corruptedMoves.length > 0;

  return { game, replayResult, hasCorruption };
}
