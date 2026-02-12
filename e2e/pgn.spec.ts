import { test, expect } from "@playwright/test";
import { cleanDatabase, disconnectDb, createGameWithMoves } from "./helpers/db";

test.beforeEach(async () => {
  await cleanDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

test.describe("GET /api/games/[id]/pgn", () => {
  test("returns 404 for non-existent game", async ({ request }) => {
    const response = await request.get("/api/games/nonexistent-game-id/pgn");
    expect(response.status()).toBe(404);
  });

  test("returns PGN for a game with no moves", async ({ request }) => {
    const { id } = await createGameWithMoves([]);
    const response = await request.get(`/api/games/${id}/pgn`);
    expect(response.status()).toBe(200);

    const text = await response.text();
    expect(text).toContain('[Event "OpenChess Game"]');
    expect(text).toContain('[Site "');
    expect(text).toContain('[Date "');
    expect(text).toContain('[White "Anonymous"]');
    expect(text).toContain('[Black "Anonymous"]');
    expect(text).toContain('[Result "*"]');
  });

  test("returns correct PGN for finished game with no moves", async ({
    request,
  }) => {
    const { id } = await createGameWithMoves([], {
      withBlackPlayer: true,
      status: "FINISHED",
      result: "WHITE_WINS",
    });

    const response = await request.get(`/api/games/${id}/pgn`);
    expect(response.status()).toBe(200);

    const text = await response.text();
    expect(text).toContain('[Result "1-0"]');
    expect(text).not.toMatch(/\*\s*1-0/);
    expect(text.trim()).toMatch(/1-0$/);
  });

  test("returns PGN for a game with moves", async ({ request }) => {
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
      {
        notation: "Nc6",
        fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
      },
    ];

    const { id } = await createGameWithMoves(moves, {
      withBlackPlayer: true,
    });
    const response = await request.get(`/api/games/${id}/pgn`);
    expect(response.status()).toBe(200);

    const text = await response.text();
    expect(text).toContain("1. e4 e5");
    expect(text).toContain("2. Nf3 Nc6");
    expect(text).toContain('[Result "*"]');
  });

  test("returns correct result for white wins", async ({ request }) => {
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
        notation: "Bc4",
        fen: "rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 2",
      },
      {
        notation: "Nc6",
        fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3",
      },
      {
        notation: "Qh5",
        fen: "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3",
      },
      {
        notation: "Nf6",
        fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
      },
      {
        notation: "Qxf7#",
        fen: "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
      },
    ];

    const { id } = await createGameWithMoves(moves, {
      withBlackPlayer: true,
      status: "FINISHED",
      result: "WHITE_WINS",
    });

    const response = await request.get(`/api/games/${id}/pgn`);
    expect(response.status()).toBe(200);

    const text = await response.text();
    expect(text).toContain('[Result "1-0"]');
    expect(text).toContain("1. e4 e5");
    expect(text).toContain("Qxf7#");
  });

  test("returns correct result for black wins", async ({ request }) => {
    const moves = [
      {
        notation: "f3",
        fen: "rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1",
      },
      {
        notation: "e5",
        fen: "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2",
      },
      {
        notation: "g4",
        fen: "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2",
      },
      {
        notation: "Qh4#",
        fen: "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
      },
    ];

    const { id } = await createGameWithMoves(moves, {
      withBlackPlayer: true,
      status: "FINISHED",
      result: "BLACK_WINS",
    });

    const response = await request.get(`/api/games/${id}/pgn`);
    expect(response.status()).toBe(200);

    const text = await response.text();
    expect(text).toContain('[Result "0-1"]');
    expect(text).toContain("Qh4#");
  });

  test("returns correct result for draw", async ({ request }) => {
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
      status: "FINISHED",
      result: "DRAW",
    });

    const response = await request.get(`/api/games/${id}/pgn`);
    expect(response.status()).toBe(200);

    const text = await response.text();
    expect(text).toContain('[Result "1/2-1/2"]');
  });

  test("sets correct content-type header", async ({ request }) => {
    const { id } = await createGameWithMoves([]);
    const response = await request.get(`/api/games/${id}/pgn`);
    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("application/x-chess-pgn");
  });

  test("sets content-disposition header for download", async ({ request }) => {
    const { id } = await createGameWithMoves([]);
    const response = await request.get(`/api/games/${id}/pgn`);
    expect(response.status()).toBe(200);

    const contentDisposition = response.headers()["content-disposition"];
    expect(contentDisposition).toContain("attachment");
    expect(contentDisposition).toContain(".pgn");
  });
});
