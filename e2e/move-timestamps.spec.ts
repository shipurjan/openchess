import { test, expect } from "@playwright/test";
import {
  cleanDatabase,
  disconnectDb,
  createGameWithMoves,
  getGameMoves,
} from "./helpers/db";

test.beforeEach(async () => {
  await cleanDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

test.describe("Move timestamps", () => {
  test("moves in Redis have timestamps when made", async () => {
    const moves = [
      {
        notation: "e4",
        fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      },
      {
        notation: "e5",
        fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
      },
    ];

    const { id } = await createGameWithMoves(moves, {
      withBlackPlayer: true,
    });

    const redisMoves = await getGameMoves(id);

    expect(redisMoves.length).toBe(2);
    for (const move of redisMoves) {
      expect(move.createdAt).toBeDefined();
      expect(typeof move.createdAt).toBe("number");
      expect(move.createdAt).toBeGreaterThan(Date.now() - 60000);
    }
  });

  test("moves in Redis have sequential timestamps", async () => {
    const moves = [
      {
        notation: "e4",
        fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      },
      {
        notation: "e5",
        fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
      },
      {
        notation: "Nf3",
        fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
      },
    ];

    const { id } = await createGameWithMoves(moves, {
      withBlackPlayer: true,
    });
    const redisMoves = await getGameMoves(id);

    for (let i = 1; i < redisMoves.length; i++) {
      expect(redisMoves[i].createdAt).toBeGreaterThanOrEqual(
        redisMoves[i - 1].createdAt,
      );
    }
  });
});
