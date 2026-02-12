import { prisma } from "./prisma";
import type { GameMove } from "./game-session";

export interface ArchivedGame {
  id: string;
  status: "FINISHED" | "ABANDONED";
  result: "WHITE_WINS" | "BLACK_WINS" | "DRAW" | null;
  whiteToken: string;
  blackToken: string | null;
  currentFen: string;
  timeInitialMs: number;
  timeIncrementMs: number;
  createdAt: Date;
  moves: ArchivedMove[];
}

export interface ArchivedMove {
  moveNumber: number;
  notation: string;
  fen: string;
  createdAt: Date;
}

const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export async function getArchivedGame(
  gameId: string,
): Promise<ArchivedGame | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      moves: {
        orderBy: { moveNumber: "asc" },
      },
    },
  });

  if (!game) return null;

  const lastMove = game.moves[game.moves.length - 1];
  const currentFen = lastMove?.fen ?? INITIAL_FEN;

  return {
    id: game.id,
    status: game.status as "FINISHED" | "ABANDONED",
    result: game.result as "WHITE_WINS" | "BLACK_WINS" | "DRAW" | null,
    whiteToken: game.whiteToken,
    blackToken: game.blackToken,
    currentFen,
    timeInitialMs: game.timeInitialMs,
    timeIncrementMs: game.timeIncrementMs,
    createdAt: game.createdAt,
    moves: game.moves.map((m) => ({
      moveNumber: m.moveNumber,
      notation: m.notation,
      fen: m.fen,
      createdAt: m.createdAt,
    })),
  };
}

export function getArchivedGamePlayerRole(
  game: ArchivedGame,
  token: string | undefined,
): "white" | "black" | "spectator" {
  if (!token) return "spectator";
  if (token === game.whiteToken) return "white";
  if (token === game.blackToken) return "black";
  return "spectator";
}

export function archivedMovesToGameMoves(moves: ArchivedMove[]): GameMove[] {
  return moves.map((m) => ({
    moveNumber: m.moveNumber,
    notation: m.notation,
    fen: m.fen,
    createdAt: m.createdAt.getTime(),
  }));
}

export async function listArchivedGames(options?: {
  limit?: number;
  offset?: number;
  status?: "FINISHED" | "ABANDONED";
}): Promise<{ games: ArchivedGame[]; total: number }> {
  const { limit = 20, offset = 0, status } = options ?? {};

  const where = status
    ? { status }
    : { status: { in: ["FINISHED" as const, "ABANDONED" as const] } };

  const [games, total] = await Promise.all([
    prisma.game.findMany({
      where,
      include: {
        moves: {
          orderBy: { moveNumber: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.game.count({ where }),
  ]);

  return {
    games: games.map((game) => {
      const lastMove = game.moves[game.moves.length - 1];
      return {
        id: game.id,
        status: game.status as "FINISHED" | "ABANDONED",
        result: game.result as "WHITE_WINS" | "BLACK_WINS" | "DRAW" | null,
        whiteToken: game.whiteToken,
        blackToken: game.blackToken,
        currentFen: lastMove?.fen ?? INITIAL_FEN,
        timeInitialMs: game.timeInitialMs,
        timeIncrementMs: game.timeIncrementMs,
        createdAt: game.createdAt,
        moves: game.moves.map((m) => ({
          moveNumber: m.moveNumber,
          notation: m.notation,
          fen: m.fen,
          createdAt: m.createdAt,
        })),
      };
    }),
    total,
  };
}
