import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./prisma", () => ({
  prisma: {
    game: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from "./prisma";

const mockPrisma = prisma as unknown as {
  game: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
};

import {
  getArchivedGame,
  getArchivedGamePlayerRole,
  archivedMovesToGameMoves,
  listArchivedGames,
  type ArchivedGame,
  type ArchivedMove,
} from "./archived-game";

const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("archived-game", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getArchivedGame", () => {
    it("returns null when game does not exist", async () => {
      mockPrisma.game.findUnique.mockResolvedValueOnce(null);

      const result = await getArchivedGame("nonexistent-id");

      expect(result).toBeNull();
      expect(mockPrisma.game.findUnique).toHaveBeenCalledWith({
        where: { id: "nonexistent-id" },
        include: { moves: { orderBy: { moveNumber: "asc" } } },
      });
    });

    it("returns archived game with moves", async () => {
      const mockGame = {
        id: "game-123",
        status: "FINISHED",
        result: "WHITE_WINS",
        whiteToken: "wt-abc",
        blackToken: "bt-xyz",
        timeInitialMs: 600000,
        timeIncrementMs: 5000,
        createdAt: new Date("2024-01-01T12:00:00Z"),
        updatedAt: new Date("2024-01-01T13:00:00Z"),
        moves: [
          {
            id: 1,
            gameId: "game-123",
            moveNumber: 1,
            notation: "e4",
            fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
            createdAt: new Date("2024-01-01T12:01:00Z"),
          },
          {
            id: 2,
            gameId: "game-123",
            moveNumber: 2,
            notation: "e5",
            fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
            createdAt: new Date("2024-01-01T12:02:00Z"),
          },
        ],
      };

      mockPrisma.game.findUnique.mockResolvedValueOnce(mockGame);

      const result = await getArchivedGame("game-123");

      expect(result).toEqual({
        id: "game-123",
        status: "FINISHED",
        result: "WHITE_WINS",
        whiteToken: "wt-abc",
        blackToken: "bt-xyz",
        currentFen:
          "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
        timeInitialMs: 600000,
        timeIncrementMs: 5000,
        createdAt: new Date("2024-01-01T12:00:00Z"),
        moves: [
          {
            moveNumber: 1,
            notation: "e4",
            fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
            createdAt: new Date("2024-01-01T12:01:00Z"),
          },
          {
            moveNumber: 2,
            notation: "e5",
            fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
            createdAt: new Date("2024-01-01T12:02:00Z"),
          },
        ],
      });
    });

    it("returns initial FEN when game has no moves", async () => {
      mockPrisma.game.findUnique.mockResolvedValueOnce({
        id: "empty-game",
        status: "ABANDONED",
        result: null,
        whiteToken: "wt",
        blackToken: null,
        timeInitialMs: 300000,
        timeIncrementMs: 0,
        createdAt: new Date("2024-02-01"),
        updatedAt: new Date("2024-02-01"),
        moves: [],
      });

      const result = await getArchivedGame("empty-game");

      expect(result!.currentFen).toBe(INITIAL_FEN);
      expect(result!.moves).toEqual([]);
    });

    it("handles all result types", async () => {
      for (const resultValue of ["WHITE_WINS", "BLACK_WINS", "DRAW", null]) {
        mockPrisma.game.findUnique.mockResolvedValueOnce({
          id: "game",
          status: "FINISHED",
          result: resultValue,
          whiteToken: "wt",
          blackToken: "bt",
          timeInitialMs: 600000,
          timeIncrementMs: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          moves: [],
        });

        const result = await getArchivedGame("game");
        expect(result!.result).toBe(resultValue);
      }
    });

    it("handles null blackToken", async () => {
      mockPrisma.game.findUnique.mockResolvedValueOnce({
        id: "solo",
        status: "ABANDONED",
        result: null,
        whiteToken: "wt",
        blackToken: null,
        timeInitialMs: 600000,
        timeIncrementMs: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        moves: [],
      });

      const result = await getArchivedGame("solo");
      expect(result!.blackToken).toBeNull();
    });

    it("propagates database errors", async () => {
      mockPrisma.game.findUnique.mockRejectedValueOnce(
        new Error("Connection lost"),
      );

      await expect(getArchivedGame("any-id")).rejects.toThrow(
        "Connection lost",
      );
    });
  });

  describe("getArchivedGamePlayerRole", () => {
    const game: ArchivedGame = {
      id: "test",
      status: "FINISHED",
      result: "WHITE_WINS",
      whiteToken: "white-abc",
      blackToken: "black-xyz",
      currentFen: INITIAL_FEN,
      timeInitialMs: 600000,
      timeIncrementMs: 0,
      createdAt: new Date(),
      moves: [],
    };

    it("returns white for matching white token", () => {
      expect(getArchivedGamePlayerRole(game, "white-abc")).toBe("white");
    });

    it("returns black for matching black token", () => {
      expect(getArchivedGamePlayerRole(game, "black-xyz")).toBe("black");
    });

    it("returns spectator for unknown token", () => {
      expect(getArchivedGamePlayerRole(game, "random")).toBe("spectator");
    });

    it("returns spectator for undefined token", () => {
      expect(getArchivedGamePlayerRole(game, undefined)).toBe("spectator");
    });

    it("returns spectator for empty string", () => {
      expect(getArchivedGamePlayerRole(game, "")).toBe("spectator");
    });

    it("is case-sensitive", () => {
      expect(getArchivedGamePlayerRole(game, "WHITE-ABC")).toBe("spectator");
    });

    it("handles null blackToken", () => {
      const noBlack: ArchivedGame = { ...game, blackToken: null };
      expect(getArchivedGamePlayerRole(noBlack, "white-abc")).toBe("white");
      expect(getArchivedGamePlayerRole(noBlack, "anything")).toBe("spectator");
    });
  });

  describe("archivedMovesToGameMoves", () => {
    it("converts Date createdAt to numeric timestamp", () => {
      const date = new Date("2024-03-15T12:30:45.678Z");
      const moves: ArchivedMove[] = [
        { moveNumber: 1, notation: "e4", fen: "fen1", createdAt: date },
      ];

      const result = archivedMovesToGameMoves(moves);

      expect(result[0].createdAt).toBe(date.getTime());
      expect(typeof result[0].createdAt).toBe("number");
    });

    it("returns empty array for empty input", () => {
      expect(archivedMovesToGameMoves([])).toEqual([]);
    });

    it("preserves move order and fields", () => {
      const moves: ArchivedMove[] = [
        {
          moveNumber: 1,
          notation: "e4",
          fen: "fen1",
          createdAt: new Date("2024-01-01T12:00:00Z"),
        },
        {
          moveNumber: 2,
          notation: "e5",
          fen: "fen2",
          createdAt: new Date("2024-01-01T12:01:00Z"),
        },
        {
          moveNumber: 3,
          notation: "Nf3",
          fen: "fen3",
          createdAt: new Date("2024-01-01T12:02:00Z"),
        },
      ];

      const result = archivedMovesToGameMoves(moves);

      expect(result.map((m) => m.notation)).toEqual(["e4", "e5", "Nf3"]);
      expect(result.map((m) => m.moveNumber)).toEqual([1, 2, 3]);
    });
  });

  describe("listArchivedGames", () => {
    it("returns games with default pagination", async () => {
      const mockGames = [
        {
          id: "g1",
          status: "FINISHED",
          result: "WHITE_WINS",
          whiteToken: "wt1",
          blackToken: "bt1",
          timeInitialMs: 600000,
          timeIncrementMs: 0,
          createdAt: new Date("2024-01-02"),
          updatedAt: new Date("2024-01-02"),
          moves: [],
        },
        {
          id: "g2",
          status: "ABANDONED",
          result: "BLACK_WINS",
          whiteToken: "wt2",
          blackToken: "bt2",
          timeInitialMs: 300000,
          timeIncrementMs: 3000,
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date("2024-01-01"),
          moves: [],
        },
      ];

      mockPrisma.game.findMany.mockResolvedValueOnce(mockGames);
      mockPrisma.game.count.mockResolvedValueOnce(2);

      const result = await listArchivedGames();

      expect(result.games).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockPrisma.game.findMany).toHaveBeenCalledWith({
        where: { status: { in: ["FINISHED", "ABANDONED"] } },
        include: { moves: { orderBy: { moveNumber: "asc" } } },
        orderBy: { createdAt: "desc" },
        take: 20,
        skip: 0,
      });
    });

    it("respects custom limit and offset", async () => {
      mockPrisma.game.findMany.mockResolvedValueOnce([]);
      mockPrisma.game.count.mockResolvedValueOnce(50);

      const result = await listArchivedGames({ limit: 10, offset: 20 });

      expect(result.total).toBe(50);
      expect(mockPrisma.game.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 20 }),
      );
    });

    it("filters by FINISHED status", async () => {
      mockPrisma.game.findMany.mockResolvedValueOnce([]);
      mockPrisma.game.count.mockResolvedValueOnce(0);

      await listArchivedGames({ status: "FINISHED" });

      expect(mockPrisma.game.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: "FINISHED" } }),
      );
    });

    it("filters by ABANDONED status", async () => {
      mockPrisma.game.findMany.mockResolvedValueOnce([]);
      mockPrisma.game.count.mockResolvedValueOnce(0);

      await listArchivedGames({ status: "ABANDONED" });

      expect(mockPrisma.game.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: "ABANDONED" } }),
      );
    });

    it("sets currentFen from last move", async () => {
      mockPrisma.game.findMany.mockResolvedValueOnce([
        {
          id: "g",
          status: "FINISHED",
          result: "DRAW",
          whiteToken: "wt",
          blackToken: "bt",
          timeInitialMs: 600000,
          timeIncrementMs: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          moves: [
            {
              id: 1,
              gameId: "g",
              moveNumber: 1,
              notation: "e4",
              fen: "fen-after-e4",
              createdAt: new Date(),
            },
          ],
        },
      ]);
      mockPrisma.game.count.mockResolvedValueOnce(1);

      const result = await listArchivedGames();

      expect(result.games[0].currentFen).toBe("fen-after-e4");
    });

    it("uses initial FEN for games with no moves", async () => {
      mockPrisma.game.findMany.mockResolvedValueOnce([
        {
          id: "empty",
          status: "ABANDONED",
          result: null,
          whiteToken: "wt",
          blackToken: null,
          timeInitialMs: 600000,
          timeIncrementMs: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          moves: [],
        },
      ]);
      mockPrisma.game.count.mockResolvedValueOnce(1);

      const result = await listArchivedGames();
      expect(result.games[0].currentFen).toBe(INITIAL_FEN);
    });

    it("returns empty list when no games exist", async () => {
      mockPrisma.game.findMany.mockResolvedValueOnce([]);
      mockPrisma.game.count.mockResolvedValueOnce(0);

      const result = await listArchivedGames();

      expect(result.games).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("propagates database errors", async () => {
      mockPrisma.game.findMany.mockRejectedValueOnce(
        new Error("Query timeout"),
      );

      await expect(listArchivedGames()).rejects.toThrow("Query timeout");
    });
  });

  describe("edge cases", () => {
    it("handles game with many moves", async () => {
      const manyMoves = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        gameId: "long-game",
        moveNumber: i + 1,
        notation: i % 2 === 0 ? "e4" : "e5",
        fen: `fen-${i + 1}`,
        createdAt: new Date(Date.now() + i * 1000),
      }));

      mockPrisma.game.findUnique.mockResolvedValueOnce({
        id: "long-game",
        status: "FINISHED",
        result: "WHITE_WINS",
        whiteToken: "wt",
        blackToken: "bt",
        timeInitialMs: 600000,
        timeIncrementMs: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        moves: manyMoves,
      });

      const result = await getArchivedGame("long-game");

      expect(result!.moves).toHaveLength(100);
      expect(result!.currentFen).toBe("fen-100");
    });

    it("handles special notation characters", async () => {
      mockPrisma.game.findUnique.mockResolvedValueOnce({
        id: "special",
        status: "FINISHED",
        result: "WHITE_WINS",
        whiteToken: "wt",
        blackToken: "bt",
        timeInitialMs: 600000,
        timeIncrementMs: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        moves: [
          {
            id: 1,
            gameId: "special",
            moveNumber: 1,
            notation: "O-O",
            fen: "fen1",
            createdAt: new Date(),
          },
          {
            id: 2,
            gameId: "special",
            moveNumber: 2,
            notation: "O-O-O",
            fen: "fen2",
            createdAt: new Date(),
          },
          {
            id: 3,
            gameId: "special",
            moveNumber: 3,
            notation: "Qxe8+",
            fen: "fen3",
            createdAt: new Date(),
          },
          {
            id: 4,
            gameId: "special",
            moveNumber: 4,
            notation: "Rxf7#",
            fen: "fen4",
            createdAt: new Date(),
          },
        ],
      });

      const result = await getArchivedGame("special");
      expect(result!.moves.map((m) => m.notation)).toEqual([
        "O-O",
        "O-O-O",
        "Qxe8+",
        "Rxf7#",
      ]);
    });

    it("preserves timestamp precision", async () => {
      const preciseDate = new Date("2024-06-15T14:30:45.123Z");
      mockPrisma.game.findUnique.mockResolvedValueOnce({
        id: "precise",
        status: "FINISHED",
        result: "DRAW",
        whiteToken: "wt",
        blackToken: "bt",
        timeInitialMs: 600000,
        timeIncrementMs: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        moves: [
          {
            id: 1,
            gameId: "precise",
            moveNumber: 1,
            notation: "e4",
            fen: "fen",
            createdAt: preciseDate,
          },
        ],
      });

      const result = await getArchivedGame("precise");
      expect(result!.moves[0].createdAt).toEqual(preciseDate);
      expect(result!.moves[0].createdAt.getMilliseconds()).toBe(123);
    });
  });
});
