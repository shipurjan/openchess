import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGame, getMoves } from "@/lib/game-session";
import { generatePgn } from "@/lib/pgn";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Check Redis first for live games
  const redisGame = await getGame(id);
  if (redisGame) {
    const moves = await getMoves(id);
    const pgn = generatePgn({
      moves,
      result: redisGame.result,
      createdAt: new Date(redisGame.createdAt),
    });

    return new NextResponse(pgn, {
      status: 200,
      headers: {
        "Content-Type": "application/x-chess-pgn",
        "Content-Disposition": `attachment; filename="game-${id}.pgn"`,
      },
    });
  }

  // Fallback to PostgreSQL for archived games
  const game = await prisma.game.findUnique({
    where: { id },
    include: {
      moves: {
        orderBy: { moveNumber: "asc" },
      },
    },
  });

  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const pgn = generatePgn({
    moves: game.moves,
    result: game.result as "WHITE_WINS" | "BLACK_WINS" | "DRAW" | null,
    createdAt: game.createdAt,
  });

  return new NextResponse(pgn, {
    status: 200,
    headers: {
      "Content-Type": "application/x-chess-pgn",
      "Content-Disposition": `attachment; filename="game-${id}.pgn"`,
    },
  });
}
