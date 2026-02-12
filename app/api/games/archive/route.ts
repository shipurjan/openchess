import { NextRequest, NextResponse } from "next/server";
import { listArchivedGames } from "@/lib/archived-game";

const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  const pageParam = request.nextUrl.searchParams.get("page");
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { games, total } = await listArchivedGames({
    limit: PAGE_SIZE,
    offset,
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return NextResponse.json({
    games: games.map((game) => ({
      id: game.id,
      status: game.status,
      result: game.result,
      moveCount: game.moves.length,
      timeInitialMs: game.timeInitialMs,
      timeIncrementMs: game.timeIncrementMs,
      createdAt: game.createdAt,
    })),
    total,
    page,
    totalPages,
  });
}
