import { describe, it, expect, vi, beforeEach } from "vitest";
import { Chess } from "chess.js";

vi.mock("./redis", () => {
  const createPipelineMock = () => ({
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  });

  return {
    redis: {
      hset: vi.fn(),
      hgetall: vi.fn(),
      hget: vi.fn(),
      expire: vi.fn(),
      eval: vi.fn(),
      lrange: vi.fn(),
      llen: vi.fn(),
      rpush: vi.fn(),
      set: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
      zadd: vi.fn(),
      zrem: vi.fn(),
      zrevrange: vi.fn(),
      sadd: vi.fn(),
      srem: vi.fn(),
      smembers: vi.fn(),
      incr: vi.fn(),
      decr: vi.fn(),
      pipeline: vi.fn(() => createPipelineMock()),
    },
  };
});

vi.mock("./prisma", () => ({
  prisma: {
    game: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { redis } from "./redis";
import { prisma } from "./prisma";

const mockRedis = redis as unknown as {
  [K in keyof typeof redis]: ReturnType<typeof vi.fn>;
};

const mockPrisma = prisma as unknown as {
  game: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

const mockUUID = vi.fn();
vi.stubGlobal("crypto", { randomUUID: mockUUID });

import {
  createGame,
  getGame,
  getSeats,
  joinGame,
  getPlayerRole,
  getPublicGames,
  getMoves,
  getMoveCount,
  getMovesWithRecovery,
  addMove,
  setGameResult,
  setGameAbandoned,
  setPlayerConnected,
  getConnectionStatus,
  setDrawOffer,
  getDrawOffer,
  clearDrawOffer,
  setRematchOffer,
  getRematchOffer,
  clearRematchOffer,
  setAbandonmentTimer,
  setAbandonmentTimerWithDeadline,
  getAbandonmentInfo,
  clearAbandonmentTimer,
  checkAndProcessAbandonment,
  deleteGame,
  createRematchGame,
  archiveGame,
  archiveAndDeleteGame,
  replayMoves,
  getGameStateWithRecovery,
  getActiveGameCountForIP,
  canCreateGame,
  trackGameForIP,
  untrackGameForIP,
  MAX_ACTIVE_GAMES_PER_IP,
  ABANDONMENT_TIMEOUT_SECONDS,
  CLAIM_WIN_TIMEOUT_SECONDS,
  setClaimWinTimer,
  claimWin,
  checkTimeout,
  isValidGameId,
  isValidIP,
  sanitizeIPForRedisKey,
  type GameMove,
} from "./game-session";

const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const TEST_GAME_ID = "550e8400-e29b-41d4-a716-446655440000";
const TEST_GAME_ID_2 = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const TEST_WHITE_TOKEN = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const TEST_BLACK_TOKEN = "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d";
const NONEXISTENT_GAME_ID = "00000000-0000-0000-0000-000000000001";
const FINISHED_GAME_ID = "00000000-0000-0000-0000-000000000002";
const WAITING_GAME_ID = "00000000-0000-0000-0000-000000000003";
const IN_PROGRESS_GAME_ID = "00000000-0000-0000-0000-000000000004";
const REMATCH_GAME_ID = "00000000-0000-0000-0000-000000000007";
const NEW_BLACK_TOKEN = "00000000-0000-0000-0000-000000000008";

describe("game-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUUID.mockReturnValue(TEST_GAME_ID);
  });

  describe("isValidGameId", () => {
    it("accepts valid UUIDs", () => {
      expect(isValidGameId(TEST_GAME_ID)).toBe(true);
      expect(isValidGameId("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(
        true,
      );
    });

    it("rejects IDs with Redis key separators", () => {
      expect(isValidGameId("550e8400:e29b-41d4-a716-446655440000")).toBe(
        false,
      );
      expect(isValidGameId("game:malicious")).toBe(false);
    });

    it("rejects IDs with pattern characters", () => {
      expect(isValidGameId("550e8400*")).toBe(false);
      expect(isValidGameId("*")).toBe(false);
      expect(isValidGameId("550e8400?")).toBe(false);
      expect(isValidGameId("[game]")).toBe(false);
    });

    it("rejects empty, too-long, and non-string values", () => {
      expect(isValidGameId("")).toBe(false);
      expect(isValidGameId("a".repeat(100))).toBe(false);
      expect(isValidGameId(null)).toBe(false);
      expect(isValidGameId(undefined)).toBe(false);
      expect(isValidGameId(123)).toBe(false);
    });
  });

  describe("isValidIP", () => {
    it("accepts valid IPv4 addresses", () => {
      expect(isValidIP("192.168.1.1")).toBe(true);
      expect(isValidIP("10.0.0.1")).toBe(true);
      expect(isValidIP("255.255.255.255")).toBe(true);
      expect(isValidIP("0.0.0.0")).toBe(true);
      expect(isValidIP("127.0.0.1")).toBe(true);
    });

    it("accepts valid IPv6 addresses", () => {
      expect(isValidIP("::1")).toBe(true);
      expect(isValidIP("fe80::1")).toBe(true);
      expect(isValidIP("2001:db8::1")).toBe(true);
    });

    it("rejects invalid values", () => {
      expect(isValidIP("")).toBe(false);
      expect(isValidIP("256.256.256.256")).toBe(false);
      expect(isValidIP("not-an-ip")).toBe(false);
      expect(isValidIP(null)).toBe(false);
      expect(isValidIP(undefined)).toBe(false);
      expect(isValidIP(123)).toBe(false);
    });

    it("rejects IPs with dangerous characters", () => {
      expect(isValidIP("192.168.1.1\n")).toBe(false);
      expect(isValidIP("192.168.*.*")).toBe(false);
      expect(isValidIP("192.168.1.?")).toBe(false);
      expect(isValidIP("[192.168.1.1]")).toBe(false);
    });
  });

  describe("sanitizeIPForRedisKey", () => {
    it("returns IPv4 unchanged", () => {
      expect(sanitizeIPForRedisKey("192.168.1.1")).toBe("192.168.1.1");
    });

    it("replaces colons in IPv6 with underscores", () => {
      expect(sanitizeIPForRedisKey("::1")).toBe("__1");
      expect(sanitizeIPForRedisKey("fe80::1")).toBe("fe80__1");
    });

    it("returns 'unknown' for invalid IPs", () => {
      expect(sanitizeIPForRedisKey("not-an-ip")).toBe("unknown");
      expect(sanitizeIPForRedisKey("")).toBe("unknown");
    });
  });

  describe("createGame", () => {
    it("creates a game with default options", async () => {
      mockUUID
        .mockReturnValueOnce(TEST_GAME_ID)
        .mockReturnValueOnce(TEST_WHITE_TOKEN);

      const result = await createGame();

      expect(result).toEqual({
        gameId: TEST_GAME_ID,
        whiteToken: TEST_WHITE_TOKEN,
      });
      expect(mockRedis.hset).toHaveBeenCalledWith(
        `game:${TEST_GAME_ID}`,
        expect.objectContaining({
          status: "WAITING",
          currentFen: INITIAL_FEN,
          isPublic: "0",
          creatorColor: "white",
        }),
      );
      expect(mockRedis.expire).toHaveBeenCalledWith(
        `game:${TEST_GAME_ID}`,
        3600,
      );
    });

    it("creates a public game and adds to lobby", async () => {
      mockUUID
        .mockReturnValueOnce(TEST_GAME_ID_2)
        .mockReturnValueOnce(TEST_WHITE_TOKEN);

      await createGame({ isPublic: true });

      expect(mockRedis.hset).toHaveBeenCalledWith(
        `game:${TEST_GAME_ID_2}`,
        expect.objectContaining({ isPublic: "1" }),
      );
      expect(mockRedis.zadd).toHaveBeenCalledWith(
        "public_games",
        expect.any(Number),
        TEST_GAME_ID_2,
      );
    });

    it("tracks game for creator IP when provided", async () => {
      mockUUID
        .mockReturnValueOnce(TEST_GAME_ID)
        .mockReturnValueOnce(TEST_WHITE_TOKEN);

      await createGame({ creatorIP: "192.168.1.1" });

      expect(mockRedis.sadd).toHaveBeenCalledWith(
        "ip_games:192.168.1.1",
        TEST_GAME_ID,
      );
    });
  });

  describe("getGame", () => {
    it("returns game session when it exists", async () => {
      mockRedis.hgetall
        .mockResolvedValueOnce({
          status: "IN_PROGRESS",
          currentFen: INITIAL_FEN,
          result: "",
          isPublic: "0",
          createdAt: "1704067200000",
        })
        .mockResolvedValueOnce({
          whiteToken: TEST_WHITE_TOKEN,
          whiteConnected: "1",
          blackToken: TEST_BLACK_TOKEN,
          blackConnected: "1",
        });

      const result = await getGame(TEST_GAME_ID);

      expect(result).toEqual(
        expect.objectContaining({
          id: TEST_GAME_ID,
          status: "IN_PROGRESS",
          whiteToken: TEST_WHITE_TOKEN,
          blackToken: TEST_BLACK_TOKEN,
          result: null,
          isPublic: false,
        }),
      );
    });

    it("returns null for nonexistent game", async () => {
      mockRedis.hgetall.mockResolvedValueOnce({});
      expect(await getGame(NONEXISTENT_GAME_ID)).toBeNull();
    });

    it("returns null for invalid game ID", async () => {
      expect(await getGame("game:*:seats")).toBeNull();
      expect(mockRedis.hgetall).not.toHaveBeenCalled();
    });
  });

  describe("getSeats", () => {
    it("returns seats when they exist", async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        whiteToken: TEST_WHITE_TOKEN,
        whiteConnected: "1",
        blackToken: TEST_BLACK_TOKEN,
        blackConnected: "0",
      });

      const result = await getSeats(TEST_GAME_ID);

      expect(result).toEqual({
        whiteToken: TEST_WHITE_TOKEN,
        whiteConnected: true,
        blackToken: TEST_BLACK_TOKEN,
        blackConnected: false,
      });
    });

    it("returns null blackToken for empty string", async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        whiteToken: TEST_WHITE_TOKEN,
        whiteConnected: "0",
        blackToken: "",
        blackConnected: "0",
      });

      const result = await getSeats(WAITING_GAME_ID);
      expect(result?.blackToken).toBeNull();
    });

    it("returns null for nonexistent seats", async () => {
      mockRedis.hgetall.mockResolvedValueOnce({});
      expect(await getSeats(NONEXISTENT_GAME_ID)).toBeNull();
    });
  });

  describe("joinGame", () => {
    it("joins a waiting game", async () => {
      mockUUID.mockReturnValueOnce(NEW_BLACK_TOKEN);
      mockRedis.hgetall
        .mockResolvedValueOnce({
          status: "WAITING",
          currentFen: INITIAL_FEN,
          result: "",
          createdAt: "1704067200000",
        })
        .mockResolvedValueOnce({
          whiteToken: TEST_WHITE_TOKEN,
          whiteConnected: "0",
          blackToken: "",
          blackConnected: "0",
        });
      mockRedis.eval.mockResolvedValueOnce("OK");

      const result = await joinGame(TEST_GAME_ID);

      expect(result).toEqual({ token: NEW_BLACK_TOKEN, role: "black" });
    });

    it("returns null for nonexistent game", async () => {
      mockRedis.hgetall.mockResolvedValueOnce({});
      expect(await joinGame(NONEXISTENT_GAME_ID)).toBeNull();
    });

    it("returns null for game already in progress", async () => {
      mockRedis.hgetall
        .mockResolvedValueOnce({
          status: "IN_PROGRESS",
          currentFen: INITIAL_FEN,
          result: "",
          createdAt: "1704067200000",
        })
        .mockResolvedValueOnce({
          whiteToken: TEST_WHITE_TOKEN,
          whiteConnected: "1",
          blackToken: TEST_BLACK_TOKEN,
          blackConnected: "1",
        });

      expect(await joinGame(IN_PROGRESS_GAME_ID)).toBeNull();
    });

    it("returns null on Lua script race condition", async () => {
      mockUUID.mockReturnValueOnce(NEW_BLACK_TOKEN);
      mockRedis.hgetall
        .mockResolvedValueOnce({
          status: "WAITING",
          currentFen: INITIAL_FEN,
          result: "",
          createdAt: "1704067200000",
        })
        .mockResolvedValueOnce({
          whiteToken: TEST_WHITE_TOKEN,
          whiteConnected: "0",
          blackToken: "",
          blackConnected: "0",
        });
      mockRedis.eval.mockResolvedValueOnce(null);

      expect(await joinGame(TEST_GAME_ID)).toBeNull();
    });
  });

  describe("getPlayerRole", () => {
    it("returns white for white token", async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        whiteToken: TEST_WHITE_TOKEN,
        whiteConnected: "1",
        blackToken: TEST_BLACK_TOKEN,
        blackConnected: "1",
      });

      expect(await getPlayerRole(TEST_GAME_ID, TEST_WHITE_TOKEN)).toBe(
        "white",
      );
    });

    it("returns black for black token", async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        whiteToken: TEST_WHITE_TOKEN,
        whiteConnected: "1",
        blackToken: TEST_BLACK_TOKEN,
        blackConnected: "1",
      });

      expect(await getPlayerRole(TEST_GAME_ID, TEST_BLACK_TOKEN)).toBe(
        "black",
      );
    });

    it("returns spectator for unknown token", async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        whiteToken: TEST_WHITE_TOKEN,
        whiteConnected: "1",
        blackToken: TEST_BLACK_TOKEN,
        blackConnected: "1",
      });

      expect(await getPlayerRole(TEST_GAME_ID, "unknown")).toBe(
        "spectator",
      );
    });

    it("returns spectator for undefined token", async () => {
      expect(await getPlayerRole(TEST_GAME_ID, undefined)).toBe(
        "spectator",
      );
    });
  });

  describe("getPublicGames", () => {
    it("returns empty array when none exist", async () => {
      mockRedis.zrevrange.mockResolvedValueOnce([]);
      expect(await getPublicGames()).toEqual([]);
    });

    it("returns waiting and in-progress public games", async () => {
      mockRedis.zrevrange.mockResolvedValueOnce([
        TEST_GAME_ID,
        "1704067200000",
        TEST_GAME_ID_2,
        "1704067100000",
      ]);
      mockRedis.hgetall
        .mockResolvedValueOnce({
          status: "WAITING",
          isPublic: "1",
          currentFen: INITIAL_FEN,
          result: "",
          createdAt: "1704067200000",
        })
        .mockResolvedValueOnce({
          whiteToken: TEST_WHITE_TOKEN,
          whiteConnected: "0",
          blackToken: "",
          blackConnected: "0",
        })
        .mockResolvedValueOnce({
          status: "IN_PROGRESS",
          isPublic: "1",
          currentFen: INITIAL_FEN,
          result: "",
          createdAt: "1704067100000",
        })
        .mockResolvedValueOnce({
          whiteToken: TEST_WHITE_TOKEN,
          whiteConnected: "1",
          blackToken: TEST_BLACK_TOKEN,
          blackConnected: "1",
        });

      const result = await getPublicGames();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(TEST_GAME_ID);
      expect(result[1].id).toBe(TEST_GAME_ID_2);
    });
  });

  describe("getMoves", () => {
    it("returns parsed moves", async () => {
      const moves: GameMove[] = [
        { moveNumber: 1, notation: "e4", fen: "fen1", createdAt: 1000 },
        { moveNumber: 2, notation: "e5", fen: "fen2", createdAt: 2000 },
      ];
      mockRedis.lrange.mockResolvedValue(
        moves.map((m) => JSON.stringify(m)),
      );

      expect(await getMoves(TEST_GAME_ID)).toEqual(moves);
    });

    it("returns empty array for no moves", async () => {
      mockRedis.lrange.mockResolvedValueOnce([]);
      expect(await getMoves(TEST_GAME_ID)).toEqual([]);
    });

    it("returns empty array for invalid game ID", async () => {
      expect(await getMoves("*")).toEqual([]);
      expect(mockRedis.lrange).not.toHaveBeenCalled();
    });
  });

  describe("getMovesWithRecovery", () => {
    it("returns all valid moves", async () => {
      const moves: GameMove[] = [
        { moveNumber: 1, notation: "e4", fen: "fen1", createdAt: 1000 },
      ];
      mockRedis.lrange.mockResolvedValue(
        moves.map((m) => JSON.stringify(m)),
      );

      const result = await getMovesWithRecovery(TEST_GAME_ID);
      expect(result.moves).toEqual(moves);
      expect(result.corruptedIndices).toEqual([]);
    });

    it("skips corrupted JSON and tracks indices", async () => {
      mockRedis.lrange.mockResolvedValue([
        JSON.stringify({
          moveNumber: 1,
          notation: "e4",
          fen: "fen1",
          createdAt: 1000,
        }),
        "corrupted-json",
        JSON.stringify({
          moveNumber: 3,
          notation: "Nf3",
          fen: "fen3",
          createdAt: 3000,
        }),
      ]);

      const result = await getMovesWithRecovery(TEST_GAME_ID);
      expect(result.moves).toHaveLength(2);
      expect(result.corruptedIndices).toEqual([1]);
    });

    it("detects moves with missing fields", async () => {
      mockRedis.lrange.mockResolvedValue([
        JSON.stringify({
          moveNumber: 1,
          notation: "e4",
          fen: "fen1",
          createdAt: 1000,
        }),
        JSON.stringify({ notation: "e5" }),
      ]);

      const result = await getMovesWithRecovery(TEST_GAME_ID);
      expect(result.moves).toHaveLength(1);
      expect(result.corruptedIndices).toEqual([1]);
    });
  });

  describe("getMoveCount", () => {
    it("returns the count", async () => {
      mockRedis.llen.mockResolvedValueOnce(5);
      expect(await getMoveCount(TEST_GAME_ID)).toBe(5);
      expect(mockRedis.llen).toHaveBeenCalledWith(
        `game:${TEST_GAME_ID}:moves`,
      );
    });
  });

  describe("addMove", () => {
    it("pushes move and updates FEN", async () => {
      const move: GameMove = {
        moveNumber: 1,
        notation: "e4",
        fen: "fen-after-e4",
        createdAt: 1000,
      };

      await addMove(TEST_GAME_ID, move);

      expect(mockRedis.rpush).toHaveBeenCalledWith(
        `game:${TEST_GAME_ID}:moves`,
        JSON.stringify(move),
      );
      expect(mockRedis.hset).toHaveBeenCalledWith(
        `game:${TEST_GAME_ID}`,
        "currentFen",
        "fen-after-e4",
      );
      expect(mockRedis.pipeline).toHaveBeenCalled();
    });
  });

  describe("setGameResult", () => {
    it("sets status to FINISHED with result", async () => {
      await setGameResult(TEST_GAME_ID, "WHITE_WINS");

      expect(mockRedis.hset).toHaveBeenCalledWith(
        `game:${TEST_GAME_ID}`,
        "status",
        "FINISHED",
        "result",
        "WHITE_WINS",
      );
    });
  });

  describe("setGameAbandoned", () => {
    it("sets status to ABANDONED with result", async () => {
      await setGameAbandoned(TEST_GAME_ID, "BLACK_WINS");

      expect(mockRedis.hset).toHaveBeenCalledWith(
        `game:${TEST_GAME_ID}`,
        "status",
        "ABANDONED",
        "result",
        "BLACK_WINS",
      );
    });
  });

  describe("connection tracking", () => {
    it("sets player connected", async () => {
      await setPlayerConnected(TEST_GAME_ID, "white", true);

      expect(mockRedis.hset).toHaveBeenCalledWith(
        `game:${TEST_GAME_ID}:seats`,
        "whiteConnected",
        "1",
      );
    });

    it("sets player disconnected", async () => {
      await setPlayerConnected(TEST_GAME_ID, "black", false);

      expect(mockRedis.hset).toHaveBeenCalledWith(
        `game:${TEST_GAME_ID}:seats`,
        "blackConnected",
        "0",
      );
    });

    it("getConnectionStatus returns both statuses", async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        whiteToken: TEST_WHITE_TOKEN,
        whiteConnected: "1",
        blackToken: TEST_BLACK_TOKEN,
        blackConnected: "0",
      });

      expect(await getConnectionStatus(TEST_GAME_ID)).toEqual({
        white: true,
        black: false,
      });
    });

    it("returns false for nonexistent game", async () => {
      mockRedis.hgetall.mockResolvedValueOnce({});

      expect(await getConnectionStatus(NONEXISTENT_GAME_ID)).toEqual({
        white: false,
        black: false,
      });
    });
  });

  describe("draw offers", () => {
    it("sets draw offer with TTL", async () => {
      await setDrawOffer(TEST_GAME_ID, "white");

      expect(mockRedis.set).toHaveBeenCalledWith(
        `game:${TEST_GAME_ID}:drawOffer`,
        "white",
        "EX",
        3600,
      );
    });

    it("gets draw offer", async () => {
      mockRedis.get.mockResolvedValueOnce("black");
      expect(await getDrawOffer(TEST_GAME_ID)).toBe("black");
    });

    it("returns null when no offer", async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      expect(await getDrawOffer(TEST_GAME_ID)).toBeNull();
    });

    it("clears draw offer", async () => {
      await clearDrawOffer(TEST_GAME_ID);
      expect(mockRedis.del).toHaveBeenCalledWith(
        `game:${TEST_GAME_ID}:drawOffer`,
      );
    });
  });

  describe("rematch offers", () => {
    it("sets rematch offer with TTL", async () => {
      await setRematchOffer(TEST_GAME_ID, "black");

      expect(mockRedis.set).toHaveBeenCalledWith(
        `game:${TEST_GAME_ID}:rematchOffer`,
        "black",
        "EX",
        3600,
      );
    });

    it("gets rematch offer", async () => {
      mockRedis.get.mockResolvedValueOnce("white");
      expect(await getRematchOffer(TEST_GAME_ID)).toBe("white");
    });

    it("clears rematch offer", async () => {
      await clearRematchOffer(TEST_GAME_ID);
      expect(mockRedis.del).toHaveBeenCalledWith(
        `game:${TEST_GAME_ID}:rematchOffer`,
      );
    });
  });

  describe("abandonment", () => {
    it("sets timer with calculated deadline", async () => {
      const before = Date.now();
      await setAbandonmentTimer(TEST_GAME_ID, "white");
      const after = Date.now();

      expect(mockRedis.set).toHaveBeenCalledWith(
        `game:${TEST_GAME_ID}:abandonment`,
        expect.any(String),
        "EX",
        ABANDONMENT_TIMEOUT_SECONDS + 60,
      );

      const parsed = JSON.parse(mockRedis.set.mock.calls[0][1]);
      expect(parsed.disconnectedColor).toBe("white");
      expect(parsed.deadline).toBeGreaterThanOrEqual(
        before + ABANDONMENT_TIMEOUT_SECONDS * 1000,
      );
      expect(parsed.deadline).toBeLessThanOrEqual(
        after + ABANDONMENT_TIMEOUT_SECONDS * 1000,
      );
    });

    it("sets timer with custom deadline", async () => {
      const deadline = Date.now() - 1000;
      await setAbandonmentTimerWithDeadline(
        TEST_GAME_ID,
        "black",
        deadline,
      );

      const parsed = JSON.parse(mockRedis.set.mock.calls[0][1]);
      expect(parsed.disconnectedColor).toBe("black");
      expect(parsed.deadline).toBe(deadline);
    });

    it("gets abandonment info", async () => {
      const info = {
        disconnectedColor: "white",
        deadline: 1704067200000,
      };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(info));

      expect(await getAbandonmentInfo(TEST_GAME_ID)).toEqual(info);
    });

    it("returns null for invalid JSON", async () => {
      mockRedis.get.mockResolvedValueOnce("invalid-json{");
      expect(await getAbandonmentInfo(TEST_GAME_ID)).toBeNull();
    });

    it("clears timer", async () => {
      await clearAbandonmentTimer(TEST_GAME_ID);
      expect(mockRedis.del).toHaveBeenCalledWith(
        `game:${TEST_GAME_ID}:abandonment`,
      );
    });
  });

  describe("checkAndProcessAbandonment", () => {
    it("returns not abandoned when no timer exists", async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      expect(await checkAndProcessAbandonment(TEST_GAME_ID)).toEqual({
        abandoned: false,
      });
    });

    it("returns not abandoned when deadline hasn't passed", async () => {
      mockRedis.get.mockResolvedValueOnce(
        JSON.stringify({
          disconnectedColor: "white",
          deadline: Date.now() + 60000,
        }),
      );

      expect(await checkAndProcessAbandonment(TEST_GAME_ID)).toEqual({
        abandoned: false,
      });
    });

    it("processes abandonment when white disconnected", async () => {
      mockRedis.get.mockResolvedValueOnce(
        JSON.stringify({
          disconnectedColor: "white",
          deadline: Date.now() - 1000,
        }),
      );
      mockRedis.hgetall
        .mockResolvedValueOnce({
          status: "ABANDONED",
          currentFen: INITIAL_FEN,
          result: "BLACK_WINS",
          createdAt: "1704067200000",
        })
        .mockResolvedValueOnce({
          whiteToken: TEST_WHITE_TOKEN,
          whiteConnected: "0",
          blackToken: TEST_BLACK_TOKEN,
          blackConnected: "0",
        });
      mockRedis.lrange.mockResolvedValueOnce([]);
      mockPrisma.game.findUnique.mockResolvedValueOnce(null);
      mockPrisma.game.create.mockResolvedValueOnce({});

      const result = await checkAndProcessAbandonment(TEST_GAME_ID);
      expect(result).toEqual({
        abandoned: true,
        result: "BLACK_WINS",
      });
    });
  });

  describe("deleteGame", () => {
    it("deletes all game-related keys", async () => {
      await deleteGame(TEST_GAME_ID);

      expect(mockRedis.del).toHaveBeenCalledWith(
        `game:${TEST_GAME_ID}`,
        `game:${TEST_GAME_ID}:seats`,
        `game:${TEST_GAME_ID}:moves`,
        `game:${TEST_GAME_ID}:drawOffer`,
        `game:${TEST_GAME_ID}:rematchOffer`,
        `game:${TEST_GAME_ID}:abandonment`,
        `game:${TEST_GAME_ID}:spectators`,
      );
      expect(mockRedis.zrem).toHaveBeenCalledWith(
        "public_games",
        TEST_GAME_ID,
      );
    });

    it("does nothing for invalid game ID", async () => {
      await deleteGame("*:*:*");
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe("createRematchGame", () => {
    it("creates a new game with fresh tokens", async () => {
      const NEW_WHITE = "00000000-0000-0000-0000-000000000009";
      const NEW_BLACK = "00000000-0000-0000-0000-00000000000a";
      mockUUID
        .mockReturnValueOnce(REMATCH_GAME_ID)
        .mockReturnValueOnce(NEW_WHITE)
        .mockReturnValueOnce(NEW_BLACK);

      const result = await createRematchGame("old-white", "old-black");

      expect(result).toEqual({
        gameId: REMATCH_GAME_ID,
        newWhiteToken: NEW_WHITE,
        newBlackToken: NEW_BLACK,
      });
      expect(mockRedis.hset).toHaveBeenCalledWith(
        `game:${REMATCH_GAME_ID}`,
        expect.objectContaining({ status: "IN_PROGRESS" }),
      );
    });
  });

  describe("archiveGame", () => {
    it("does nothing for nonexistent game", async () => {
      mockRedis.hgetall.mockResolvedValueOnce({});
      await archiveGame(NONEXISTENT_GAME_ID);
      expect(mockPrisma.game.create).not.toHaveBeenCalled();
    });

    it("does nothing for WAITING game", async () => {
      mockRedis.hgetall
        .mockResolvedValueOnce({
          status: "WAITING",
          currentFen: INITIAL_FEN,
          result: "",
          createdAt: "1704067200000",
        })
        .mockResolvedValueOnce({
          whiteToken: TEST_WHITE_TOKEN,
          whiteConnected: "0",
          blackToken: "",
          blackConnected: "0",
        });

      await archiveGame(WAITING_GAME_ID);
      expect(mockPrisma.game.create).not.toHaveBeenCalled();
    });

    it("does nothing when already archived", async () => {
      mockRedis.hgetall
        .mockResolvedValueOnce({
          status: "FINISHED",
          currentFen: INITIAL_FEN,
          result: "WHITE_WINS",
          createdAt: "1704067200000",
        })
        .mockResolvedValueOnce({
          whiteToken: TEST_WHITE_TOKEN,
          whiteConnected: "0",
          blackToken: TEST_BLACK_TOKEN,
          blackConnected: "0",
        });
      mockRedis.lrange.mockResolvedValueOnce([]);
      mockPrisma.game.findUnique.mockResolvedValueOnce({
        id: TEST_GAME_ID,
      });

      await archiveGame(TEST_GAME_ID);
      expect(mockPrisma.game.create).not.toHaveBeenCalled();
    });

    it("archives FINISHED game with moves", async () => {
      const moves: GameMove[] = [
        {
          moveNumber: 1,
          notation: "e4",
          fen: "fen1",
          createdAt: 1704067200000,
        },
      ];

      mockRedis.hgetall
        .mockResolvedValueOnce({
          status: "FINISHED",
          currentFen: "fen1",
          result: "WHITE_WINS",
          isPublic: "0",
          createdAt: "1704067200000",
        })
        .mockResolvedValueOnce({
          whiteToken: TEST_WHITE_TOKEN,
          whiteConnected: "0",
          blackToken: TEST_BLACK_TOKEN,
          blackConnected: "0",
        });
      mockRedis.lrange.mockResolvedValueOnce(
        moves.map((m) => JSON.stringify(m)),
      );
      mockPrisma.game.findUnique.mockResolvedValueOnce(null);
      mockPrisma.game.create.mockResolvedValueOnce({});

      await archiveGame(FINISHED_GAME_ID);

      expect(mockPrisma.game.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: FINISHED_GAME_ID,
          status: "FINISHED",
          result: "WHITE_WINS",
          moves: {
            create: [
              expect.objectContaining({
                moveNumber: 1,
                notation: "e4",
              }),
            ],
          },
        }),
      });
    });

    it("handles concurrent archive race (P2002 unique constraint)", async () => {
      mockRedis.hgetall
        .mockResolvedValueOnce({
          status: "FINISHED",
          currentFen: "fen1",
          result: "WHITE_WINS",
          isPublic: "0",
          createdAt: "1704067200000",
        })
        .mockResolvedValueOnce({
          whiteToken: TEST_WHITE_TOKEN,
          whiteConnected: "0",
          blackToken: TEST_BLACK_TOKEN,
          blackConnected: "0",
        });
      mockRedis.lrange.mockResolvedValueOnce([]);
      mockPrisma.game.findUnique.mockResolvedValueOnce(null);

      // Simulate P2002: another call archived the game between findUnique and create
      const p2002Error = new Error("Unique constraint failed on the fields: (`id`)");
      Object.assign(p2002Error, {
        code: "P2002",
        meta: { target: ["id"] },
        clientVersion: "7.4.0",
      });
      mockPrisma.game.create.mockRejectedValueOnce(p2002Error);

      // Should not throw — the game was already archived by the other call
      await expect(archiveGame(FINISHED_GAME_ID)).resolves.toBeUndefined();
    });
  });

  describe("archiveAndDeleteGame", () => {
    it("archives then deletes", async () => {
      mockRedis.hgetall
        .mockResolvedValueOnce({
          status: "FINISHED",
          currentFen: INITIAL_FEN,
          result: "WHITE_WINS",
          isPublic: "0",
          createdAt: "1704067200000",
        })
        .mockResolvedValueOnce({
          whiteToken: TEST_WHITE_TOKEN,
          whiteConnected: "0",
          blackToken: TEST_BLACK_TOKEN,
          blackConnected: "0",
        });
      mockRedis.lrange.mockResolvedValueOnce([]);
      mockPrisma.game.findUnique.mockResolvedValueOnce(null);
      mockPrisma.game.create.mockResolvedValueOnce({});

      await archiveAndDeleteGame(TEST_GAME_ID);

      expect(mockPrisma.game.create).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalledWith(
        `game:${TEST_GAME_ID}`,
        `game:${TEST_GAME_ID}:seats`,
        `game:${TEST_GAME_ID}:moves`,
        `game:${TEST_GAME_ID}:drawOffer`,
        `game:${TEST_GAME_ID}:rematchOffer`,
        `game:${TEST_GAME_ID}:abandonment`,
        `game:${TEST_GAME_ID}:spectators`,
      );
    });
  });

  describe("checkTimeout", () => {
    it("returns not timed out when lastMoveAt is 0 (before first move)", async () => {
      mockRedis.hgetall.mockResolvedValueOnce({
        whiteTimeMs: "5000",
        blackTimeMs: "5000",
        lastMoveAt: "0",
        currentFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      });

      const result = await checkTimeout(TEST_GAME_ID, "white", Date.now());
      expect(result.timedOut).toBe(false);
    });

    it("returns timed out when active player's clock has expired", async () => {
      const lastMoveAt = Date.now() - 6000;
      // FEN has "b" turn — black's clock is ticking
      mockRedis.hgetall.mockResolvedValueOnce({
        whiteTimeMs: "5000",
        blackTimeMs: "5000",
        lastMoveAt: String(lastMoveAt),
        currentFen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      });

      const result = await checkTimeout(TEST_GAME_ID, "black", Date.now());
      expect(result.timedOut).toBe(true);
      expect(result.remainingMs).toBe(0);
    });

    it("returns not timed out when it is not the checked player's turn", async () => {
      const lastMoveAt = Date.now() - 6000;
      // FEN has "b" turn — black's clock is ticking, not white's
      mockRedis.hgetall.mockResolvedValueOnce({
        whiteTimeMs: "5000",
        blackTimeMs: "5000",
        lastMoveAt: String(lastMoveAt),
        currentFen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      });

      const result = await checkTimeout(TEST_GAME_ID, "white", Date.now());
      expect(result.timedOut).toBe(false);
    });

    it("returns not timed out when clock has time remaining", async () => {
      const lastMoveAt = Date.now() - 2000;
      mockRedis.hgetall.mockResolvedValueOnce({
        whiteTimeMs: "5000",
        blackTimeMs: "5000",
        lastMoveAt: String(lastMoveAt),
        currentFen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      });

      const result = await checkTimeout(TEST_GAME_ID, "black", Date.now());
      expect(result.timedOut).toBe(false);
      expect(result.remainingMs).toBeGreaterThan(0);
    });
  });

  describe("IP active game tracking", () => {
    it("returns 0 for IP with no games", async () => {
      mockRedis.smembers.mockResolvedValueOnce([]);
      expect(await getActiveGameCountForIP("192.168.1.1")).toBe(0);
    });

    it("counts only active games", async () => {
      mockRedis.smembers.mockResolvedValueOnce([
        "game-1",
        "game-2",
        "game-3",
      ]);
      mockRedis.hget
        .mockResolvedValueOnce("WAITING")
        .mockResolvedValueOnce("IN_PROGRESS")
        .mockResolvedValueOnce("FINISHED");

      expect(await getActiveGameCountForIP("192.168.1.1")).toBe(2);
      expect(mockRedis.srem).toHaveBeenCalledWith(
        "ip_games:192.168.1.1",
        "game-3",
      );
    });

    it("canCreateGame allows when under limit", async () => {
      mockRedis.smembers.mockResolvedValueOnce(["game-1"]);
      mockRedis.hget.mockResolvedValueOnce("WAITING");

      const result = await canCreateGame("192.168.1.1");
      expect(result.allowed).toBe(true);
      expect(result.activeCount).toBe(1);
    });

    it("canCreateGame blocks at limit", async () => {
      const gameIds = Array.from(
        { length: MAX_ACTIVE_GAMES_PER_IP },
        (_, i) => `game-${i}`,
      );
      mockRedis.smembers.mockResolvedValueOnce(gameIds);
      gameIds.forEach(() =>
        mockRedis.hget.mockResolvedValueOnce("IN_PROGRESS"),
      );

      const result = await canCreateGame("192.168.1.1");
      expect(result.allowed).toBe(false);
    });

    it("trackGameForIP adds to set with TTL", async () => {
      await trackGameForIP("192.168.1.1", TEST_GAME_ID);

      expect(mockRedis.sadd).toHaveBeenCalledWith(
        "ip_games:192.168.1.1",
        TEST_GAME_ID,
      );
      expect(mockRedis.expire).toHaveBeenCalledWith(
        "ip_games:192.168.1.1",
        86400,
      );
    });

    it("untrackGameForIP removes from set", async () => {
      await untrackGameForIP("192.168.1.1", TEST_GAME_ID);

      expect(mockRedis.srem).toHaveBeenCalledWith(
        "ip_games:192.168.1.1",
        TEST_GAME_ID,
      );
    });

    it("handles IPv6 in tracking keys", async () => {
      await trackGameForIP("::1", TEST_GAME_ID);
      expect(mockRedis.sadd).toHaveBeenCalledWith(
        "ip_games:__1",
        TEST_GAME_ID,
      );
    });
  });

  describe("replayMoves", () => {
    it("replays valid moves", () => {
      const moves: GameMove[] = [
        { moveNumber: 1, notation: "e4", fen: "", createdAt: 1000 },
        { moveNumber: 2, notation: "e5", fen: "", createdAt: 2000 },
        { moveNumber: 3, notation: "Nf3", fen: "", createdAt: 3000 },
      ];

      const result = replayMoves(moves);
      expect(result.validMoves).toHaveLength(3);
      expect(result.corruptedMoves).toHaveLength(0);
      expect(result.chess.history()).toEqual(["e4", "e5", "Nf3"]);
    });

    it("stops at first corrupted move", () => {
      const moves: GameMove[] = [
        { moveNumber: 1, notation: "e4", fen: "", createdAt: 1000 },
        { moveNumber: 2, notation: "e5", fen: "", createdAt: 2000 },
        {
          moveNumber: 3,
          notation: "INVALID_MOVE",
          fen: "",
          createdAt: 3000,
        },
        { moveNumber: 4, notation: "Nc6", fen: "", createdAt: 4000 },
      ];

      const result = replayMoves(moves);
      expect(result.validMoves).toHaveLength(2);
      expect(result.corruptedMoves).toHaveLength(1);
      expect(result.corruptedMoves[0].index).toBe(2);
    });

    it("detects illegal moves", () => {
      const moves: GameMove[] = [
        { moveNumber: 1, notation: "e4", fen: "", createdAt: 1000 },
        { moveNumber: 2, notation: "e4", fen: "", createdAt: 2000 },
      ];

      const result = replayMoves(moves);
      expect(result.validMoves).toHaveLength(1);
      expect(result.corruptedMoves).toHaveLength(1);
    });

    it("returns last valid FEN after corruption", () => {
      const moves: GameMove[] = [
        { moveNumber: 1, notation: "e4", fen: "", createdAt: 1000 },
        {
          moveNumber: 2,
          notation: "CORRUPTED",
          fen: "",
          createdAt: 2000,
        },
      ];

      const result = replayMoves(moves);
      expect(result.lastValidFen).toContain(
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR",
      );
    });

    it("handles empty moves", () => {
      const result = replayMoves([]);
      expect(result.validMoves).toHaveLength(0);
      expect(result.corruptedMoves).toHaveLength(0);
      expect(result.lastValidFen).toContain(INITIAL_FEN);
    });
  });

  describe("getGameStateWithRecovery", () => {
    it("returns null game for nonexistent game", async () => {
      mockRedis.hgetall.mockResolvedValueOnce({});

      const result =
        await getGameStateWithRecovery(NONEXISTENT_GAME_ID);
      expect(result).toEqual({
        game: null,
        replayResult: null,
        hasCorruption: false,
      });
    });

    it("detects corruption in moves", async () => {
      mockRedis.hgetall
        .mockResolvedValueOnce({
          status: "IN_PROGRESS",
          currentFen: INITIAL_FEN,
          result: "",
          createdAt: "1704067200000",
        })
        .mockResolvedValueOnce({
          whiteToken: TEST_WHITE_TOKEN,
          whiteConnected: "1",
          blackToken: TEST_BLACK_TOKEN,
          blackConnected: "1",
        });
      mockRedis.lrange.mockResolvedValueOnce([
        JSON.stringify({
          moveNumber: 1,
          notation: "e4",
          fen: "fen",
          createdAt: 1000,
        }),
        "invalid-json",
      ]);

      const result = await getGameStateWithRecovery(TEST_GAME_ID);
      expect(result.hasCorruption).toBe(true);
    });

    it("reports no corruption for valid moves", async () => {
      mockRedis.hgetall
        .mockResolvedValueOnce({
          status: "IN_PROGRESS",
          currentFen: INITIAL_FEN,
          result: "",
          createdAt: "1704067200000",
        })
        .mockResolvedValueOnce({
          whiteToken: TEST_WHITE_TOKEN,
          whiteConnected: "1",
          blackToken: TEST_BLACK_TOKEN,
          blackConnected: "1",
        });
      mockRedis.lrange.mockResolvedValueOnce([
        JSON.stringify({
          moveNumber: 1,
          notation: "e4",
          fen: "fen",
          createdAt: 1000,
        }),
      ]);

      const result = await getGameStateWithRecovery(TEST_GAME_ID);
      expect(result.hasCorruption).toBe(false);
    });
  });

  describe("setClaimWinTimer", () => {
    it("sets timer with ~60s deadline", async () => {
      const before = Date.now();
      const deadline = await setClaimWinTimer(TEST_GAME_ID, "black");
      const after = Date.now();

      expect(mockRedis.set).toHaveBeenCalledWith(
        `game:${TEST_GAME_ID}:abandonment`,
        expect.any(String),
        "EX",
        CLAIM_WIN_TIMEOUT_SECONDS + 60,
      );

      const parsed = JSON.parse(mockRedis.set.mock.calls[0][1]);
      expect(parsed.disconnectedColor).toBe("black");
      expect(deadline).toBeGreaterThanOrEqual(
        before + CLAIM_WIN_TIMEOUT_SECONDS * 1000,
      );
      expect(deadline).toBeLessThanOrEqual(
        after + CLAIM_WIN_TIMEOUT_SECONDS * 1000,
      );
    });

    it("returns 0 for invalid game ID", async () => {
      expect(await setClaimWinTimer("invalid", "white")).toBe(0);
    });
  });

  describe("claimWin", () => {
    it("succeeds when Lua script returns OK", async () => {
      // Lua script returns success
      mockRedis.eval.mockResolvedValueOnce(["OK", "WHITE_WINS"]);

      // archiveGame -> getGame + getMoves
      mockRedis.hgetall
        .mockResolvedValueOnce({
          status: "ABANDONED",
          currentFen: INITIAL_FEN,
          result: "WHITE_WINS",
          createdAt: "1704067200000",
          timeInitialMs: "300000",
        })
        .mockResolvedValueOnce({
          whiteToken: TEST_WHITE_TOKEN,
          whiteConnected: "1",
          blackToken: TEST_BLACK_TOKEN,
          blackConnected: "0",
        });
      mockRedis.lrange.mockResolvedValueOnce([]);
      mockPrisma.game.findUnique.mockResolvedValueOnce(null);
      mockPrisma.game.create.mockResolvedValueOnce({});

      const result = await claimWin(TEST_GAME_ID, "white");

      expect(result.success).toBe(true);
      expect(result.result).toBe("WHITE_WINS");
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        4,
        `game:${TEST_GAME_ID}`,
        `game:${TEST_GAME_ID}:seats`,
        `game:${TEST_GAME_ID}:abandonment`,
        `game:${TEST_GAME_ID}:moves`,
        "white",
        expect.any(String),
        "3600",
      );
    });

    it("archives the game after successful claim", async () => {
      mockRedis.eval.mockResolvedValueOnce(["OK", "BLACK_WINS"]);

      // archiveGame -> getGame + getMoves
      mockRedis.hgetall
        .mockResolvedValueOnce({
          status: "ABANDONED",
          currentFen: INITIAL_FEN,
          result: "BLACK_WINS",
          createdAt: "1704067200000",
          timeInitialMs: "300000",
        })
        .mockResolvedValueOnce({
          whiteToken: TEST_WHITE_TOKEN,
          whiteConnected: "0",
          blackToken: TEST_BLACK_TOKEN,
          blackConnected: "1",
        });
      mockRedis.lrange.mockResolvedValueOnce([]);
      mockPrisma.game.findUnique.mockResolvedValueOnce(null);
      mockPrisma.game.create.mockResolvedValueOnce({});

      await claimWin(TEST_GAME_ID, "black");

      expect(mockPrisma.game.create).toHaveBeenCalled();
    });

    it("fails when game not found", async () => {
      mockRedis.eval.mockResolvedValueOnce(["ERR", "Game not found"]);

      const result = await claimWin(NONEXISTENT_GAME_ID, "white");
      expect(result).toEqual({
        success: false,
        error: "Game not found",
      });
    });

    it("fails when game is not in progress", async () => {
      mockRedis.eval.mockResolvedValueOnce([
        "ERR",
        "Game is not in progress",
      ]);

      const result = await claimWin(TEST_GAME_ID, "white");
      expect(result).toEqual({
        success: false,
        error: "Game is not in progress",
      });
    });

    it("fails for unlimited game", async () => {
      mockRedis.eval.mockResolvedValueOnce(["ERR", "Not a timed game"]);

      const result = await claimWin(TEST_GAME_ID, "white");
      expect(result).toEqual({
        success: false,
        error: "Not a timed game",
      });
    });

    it("fails when no timer active", async () => {
      mockRedis.eval.mockResolvedValueOnce([
        "ERR",
        "No disconnect timer active",
      ]);

      const result = await claimWin(TEST_GAME_ID, "white");
      expect(result).toEqual({
        success: false,
        error: "No disconnect timer active",
      });
    });

    it("fails when claimer is the disconnected player", async () => {
      mockRedis.eval.mockResolvedValueOnce([
        "ERR",
        "You are the disconnected player",
      ]);

      const result = await claimWin(TEST_GAME_ID, "white");
      expect(result).toEqual({
        success: false,
        error: "You are the disconnected player",
      });
    });

    it("fails when opponent has reconnected", async () => {
      mockRedis.eval.mockResolvedValueOnce([
        "ERR",
        "Opponent has reconnected",
      ]);

      const result = await claimWin(TEST_GAME_ID, "white");
      expect(result).toEqual({
        success: false,
        error: "Opponent has reconnected",
      });
    });

    it("fails when deadline has not passed", async () => {
      mockRedis.eval.mockResolvedValueOnce([
        "ERR",
        "Deadline has not passed",
      ]);

      const result = await claimWin(TEST_GAME_ID, "white");
      expect(result).toEqual({
        success: false,
        error: "Deadline has not passed",
      });
    });

    it("fails for invalid game ID", async () => {
      const result = await claimWin("invalid", "white");
      expect(result).toEqual({
        success: false,
        error: "Invalid game ID",
      });
      expect(mockRedis.eval).not.toHaveBeenCalled();
    });
  });

  describe("chess.js behavior", () => {
    it("throws on invalid SAN", () => {
      const chess = new Chess();
      chess.move("e4");
      expect(() => chess.move("CORRUPTED")).toThrow();
    });

    it("throws on illegal move", () => {
      const chess = new Chess();
      chess.move("e4");
      expect(() => chess.move("e4")).toThrow();
    });
  });
});
