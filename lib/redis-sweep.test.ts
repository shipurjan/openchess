import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./redis", () => ({
  redis: {
    scan: vi.fn(),
  },
}));

vi.mock("./game-session", () => ({
  isValidGameId: vi.fn(
    (id: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      ),
  ),
  getGame: vi.fn(),
  getConnectionStatus: vi.fn(),
  getAbandonmentInfo: vi.fn(),
  setAbandonmentTimer: vi.fn(),
  checkAndProcessAbandonment: vi.fn(),
  deleteGame: vi.fn(),
  archiveAndDeleteGame: vi.fn(),
}));

import { redis } from "./redis";
import * as session from "./game-session";
import {
  scanGameKeys,
  sweepOrphanedWaitingGames,
  sweepZombieRooms,
  sweepFinishedGames,
  runFullSweep,
  startSweepJob,
  stopSweepJob,
  WAITING_GAME_MAX_AGE_MS,
} from "./redis-sweep";

const mockRedis = redis as unknown as {
  scan: ReturnType<typeof vi.fn>;
};

const mockSession = session as unknown as {
  [K in keyof typeof session]: ReturnType<typeof vi.fn>;
};

const GAME_ID_1 = "550e8400-e29b-41d4-a716-446655440001";
const GAME_ID_2 = "550e8400-e29b-41d4-a716-446655440002";
const GAME_ID_3 = "550e8400-e29b-41d4-a716-446655440003";

describe("redis-sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopSweepJob();
    vi.useRealTimers();
  });

  describe("scanGameKeys", () => {
    it("returns empty array when no keys exist", async () => {
      mockRedis.scan.mockResolvedValueOnce(["0", []]);
      expect(await scanGameKeys()).toEqual([]);
    });

    it("returns game IDs from keys", async () => {
      mockRedis.scan.mockResolvedValueOnce([
        "0",
        [`game:${GAME_ID_1}`, `game:${GAME_ID_2}`],
      ]);

      const result = await scanGameKeys();
      expect(result).toContain(GAME_ID_1);
      expect(result).toContain(GAME_ID_2);
    });

    it("filters out sub-keys", async () => {
      mockRedis.scan.mockResolvedValueOnce([
        "0",
        [
          `game:${GAME_ID_1}`,
          `game:${GAME_ID_1}:seats`,
          `game:${GAME_ID_1}:moves`,
        ],
      ]);

      const result = await scanGameKeys();
      expect(result).toEqual([GAME_ID_1]);
    });

    it("handles cursor pagination", async () => {
      mockRedis.scan
        .mockResolvedValueOnce(["5", [`game:${GAME_ID_1}`]])
        .mockResolvedValueOnce(["0", [`game:${GAME_ID_2}`]]);

      const result = await scanGameKeys();
      expect(result).toContain(GAME_ID_1);
      expect(result).toContain(GAME_ID_2);
      expect(mockRedis.scan).toHaveBeenCalledTimes(2);
    });

    it("filters out invalid game IDs", async () => {
      mockRedis.scan.mockResolvedValueOnce([
        "0",
        [`game:${GAME_ID_1}`, "game:invalid-id", "game:*"],
      ]);

      expect(await scanGameKeys()).toEqual([GAME_ID_1]);
    });
  });

  describe("sweepOrphanedWaitingGames", () => {
    it("deletes WAITING games beyond max age", async () => {
      mockRedis.scan.mockResolvedValueOnce([
        "0",
        [`game:${GAME_ID_1}`],
      ]);
      mockSession.getGame.mockResolvedValueOnce({
        id: GAME_ID_1,
        status: "WAITING",
        createdAt: Date.now() - WAITING_GAME_MAX_AGE_MS - 1000,
      });

      const result = await sweepOrphanedWaitingGames();

      expect(result.deleted).toBe(1);
      expect(mockSession.deleteGame).toHaveBeenCalledWith(GAME_ID_1);
    });

    it("keeps recent WAITING games", async () => {
      mockRedis.scan.mockResolvedValueOnce([
        "0",
        [`game:${GAME_ID_1}`],
      ]);
      mockSession.getGame.mockResolvedValueOnce({
        id: GAME_ID_1,
        status: "WAITING",
        createdAt: Date.now() - WAITING_GAME_MAX_AGE_MS + 60000,
      });

      const result = await sweepOrphanedWaitingGames();

      expect(result.deleted).toBe(0);
      expect(mockSession.deleteGame).not.toHaveBeenCalled();
    });

    it("ignores IN_PROGRESS games", async () => {
      mockRedis.scan.mockResolvedValueOnce([
        "0",
        [`game:${GAME_ID_1}`],
      ]);
      mockSession.getGame.mockResolvedValueOnce({
        id: GAME_ID_1,
        status: "IN_PROGRESS",
        createdAt: Date.now() - WAITING_GAME_MAX_AGE_MS - 1000,
      });

      expect((await sweepOrphanedWaitingGames()).deleted).toBe(0);
    });

    it("handles errors gracefully", async () => {
      mockRedis.scan.mockResolvedValueOnce([
        "0",
        [`game:${GAME_ID_1}`, `game:${GAME_ID_2}`],
      ]);
      mockSession.getGame
        .mockRejectedValueOnce(new Error("Redis error"))
        .mockResolvedValueOnce({
          id: GAME_ID_2,
          status: "WAITING",
          createdAt: Date.now() - WAITING_GAME_MAX_AGE_MS - 1000,
        });

      const result = await sweepOrphanedWaitingGames();

      expect(result.deleted).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe("sweepZombieRooms", () => {
    it("sets abandonment timer when both players disconnected", async () => {
      mockRedis.scan.mockResolvedValueOnce([
        "0",
        [`game:${GAME_ID_1}`],
      ]);
      mockSession.getGame.mockResolvedValueOnce({
        id: GAME_ID_1,
        status: "IN_PROGRESS",
      });
      mockSession.getConnectionStatus.mockResolvedValueOnce({
        white: false,
        black: false,
      });
      mockSession.getAbandonmentInfo.mockResolvedValueOnce(null);

      const result = await sweepZombieRooms();

      expect(mockSession.setAbandonmentTimer).toHaveBeenCalledWith(
        GAME_ID_1,
        "white",
      );
      expect(result.cleaned).toBe(0);
    });

    it("processes expired abandonment deadlines", async () => {
      mockRedis.scan.mockResolvedValueOnce([
        "0",
        [`game:${GAME_ID_1}`],
      ]);
      mockSession.getGame.mockResolvedValueOnce({
        id: GAME_ID_1,
        status: "IN_PROGRESS",
      });
      mockSession.getConnectionStatus.mockResolvedValueOnce({
        white: false,
        black: false,
      });
      mockSession.getAbandonmentInfo.mockResolvedValueOnce({
        disconnectedColor: "white",
        deadline: Date.now() - 1000,
      });
      mockSession.checkAndProcessAbandonment.mockResolvedValueOnce({
        abandoned: true,
        result: "BLACK_WINS",
      });

      expect((await sweepZombieRooms()).cleaned).toBe(1);
    });

    it("processes one-player-disconnected games", async () => {
      mockRedis.scan.mockResolvedValueOnce([
        "0",
        [`game:${GAME_ID_1}`],
      ]);
      mockSession.getGame.mockResolvedValueOnce({
        id: GAME_ID_1,
        status: "IN_PROGRESS",
      });
      mockSession.getConnectionStatus.mockResolvedValueOnce({
        white: true,
        black: false,
      });
      mockSession.checkAndProcessAbandonment.mockResolvedValueOnce({
        abandoned: true,
        result: "WHITE_WINS",
      });

      expect((await sweepZombieRooms()).cleaned).toBe(1);
    });

    it("skips fully connected games", async () => {
      mockRedis.scan.mockResolvedValueOnce([
        "0",
        [`game:${GAME_ID_1}`],
      ]);
      mockSession.getGame.mockResolvedValueOnce({
        id: GAME_ID_1,
        status: "IN_PROGRESS",
      });
      mockSession.getConnectionStatus.mockResolvedValueOnce({
        white: true,
        black: true,
      });

      expect((await sweepZombieRooms()).cleaned).toBe(0);
    });
  });

  describe("sweepFinishedGames", () => {
    it("archives finished games with no connected players", async () => {
      mockRedis.scan.mockResolvedValueOnce([
        "0",
        [`game:${GAME_ID_1}`],
      ]);
      mockSession.getGame.mockResolvedValueOnce({
        id: GAME_ID_1,
        status: "FINISHED",
      });
      mockSession.getConnectionStatus.mockResolvedValueOnce({
        white: false,
        black: false,
      });

      const result = await sweepFinishedGames();

      expect(result.cleaned).toBe(1);
      expect(mockSession.archiveAndDeleteGame).toHaveBeenCalledWith(
        GAME_ID_1,
      );
    });

    it("skips finished games with connected players", async () => {
      mockRedis.scan.mockResolvedValueOnce([
        "0",
        [`game:${GAME_ID_1}`],
      ]);
      mockSession.getGame.mockResolvedValueOnce({
        id: GAME_ID_1,
        status: "FINISHED",
      });
      mockSession.getConnectionStatus.mockResolvedValueOnce({
        white: true,
        black: false,
      });

      expect((await sweepFinishedGames()).cleaned).toBe(0);
    });

    it("ignores IN_PROGRESS games", async () => {
      mockRedis.scan.mockResolvedValueOnce([
        "0",
        [`game:${GAME_ID_1}`],
      ]);
      mockSession.getGame.mockResolvedValueOnce({
        id: GAME_ID_1,
        status: "IN_PROGRESS",
      });

      expect((await sweepFinishedGames()).cleaned).toBe(0);
    });
  });

  describe("runFullSweep", () => {
    it("aggregates results from all sweep tasks", async () => {
      // Orphaned games scan
      mockRedis.scan.mockResolvedValueOnce([
        "0",
        [`game:${GAME_ID_1}`],
      ]);
      mockSession.getGame.mockResolvedValueOnce({
        id: GAME_ID_1,
        status: "WAITING",
        createdAt: Date.now() - WAITING_GAME_MAX_AGE_MS - 1000,
      });

      // Zombie rooms scan
      mockRedis.scan.mockResolvedValueOnce([
        "0",
        [`game:${GAME_ID_2}`],
      ]);
      mockSession.getGame.mockResolvedValueOnce({
        id: GAME_ID_2,
        status: "IN_PROGRESS",
      });
      mockSession.getConnectionStatus.mockResolvedValueOnce({
        white: true,
        black: true,
      });

      // Finished games scan
      mockRedis.scan.mockResolvedValueOnce([
        "0",
        [`game:${GAME_ID_3}`],
      ]);
      mockSession.getGame.mockResolvedValueOnce({
        id: GAME_ID_3,
        status: "FINISHED",
      });
      mockSession.getConnectionStatus.mockResolvedValueOnce({
        white: false,
        black: false,
      });

      const result = await runFullSweep();

      expect(result.orphanedGamesDeleted).toBe(1);
      expect(result.zombieRoomsCleaned).toBe(1);
      expect(result.errors).toEqual([]);
    });
  });

  describe("startSweepJob / stopSweepJob", () => {
    it("runs initial sweep on start", async () => {
      mockRedis.scan.mockResolvedValue(["0", []]);

      startSweepJob();

      await vi.waitFor(() => {
        expect(mockRedis.scan).toHaveBeenCalled();
      });

      stopSweepJob();
    });

    it("stops periodic sweeps", async () => {
      mockRedis.scan.mockResolvedValue(["0", []]);

      startSweepJob();
      await vi.waitFor(() => {
        expect(mockRedis.scan).toHaveBeenCalled();
      });

      vi.clearAllMocks();
      stopSweepJob();

      vi.advanceTimersByTime(10 * 60 * 1000);
      await Promise.resolve();

      expect(mockRedis.scan).not.toHaveBeenCalled();
    });
  });
});
