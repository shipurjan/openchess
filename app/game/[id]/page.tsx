import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getGame, getMoves, getPlayerRole } from "@/lib/game-session";
import { GameBoard } from "@/components/GameBoard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Game ${id.slice(0, 8)}` };
}

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(`chess_token_${id}`)?.value;

  // Check Redis first for live games
  const redisGame = await getGame(id);

  if (redisGame) {
    const moves = await getMoves(id);
    const playerRole = await getPlayerRole(id, cookieToken);
    const canJoin =
      playerRole === "spectator" &&
      redisGame.status === "WAITING" &&
      !redisGame.blackToken;

    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <GameBoard
          gameId={id}
          status={redisGame.status}
          result={redisGame.result}
          playerRole={playerRole}
          currentFen={redisGame.currentFen}
          canJoin={canJoin}
          moves={moves.map((m) => ({
            moveNumber: m.moveNumber,
            notation: m.notation,
            createdAt: m.createdAt,
            fen: m.fen,
          }))}
          timeInitialMs={redisGame.timeInitialMs}
          timeIncrementMs={redisGame.timeIncrementMs}
        />
      </div>
    );
  }

  // Fallback to PostgreSQL for archived games
  const pgGame = await prisma.game.findUnique({
    where: { id },
    include: { moves: { orderBy: { moveNumber: "asc" } } },
  });

  if (!pgGame) notFound();

  let playerRole: "white" | "black" | "spectator" = "spectator";
  if (cookieToken) {
    if (cookieToken === pgGame.whiteToken) playerRole = "white";
    else if (cookieToken === pgGame.blackToken) playerRole = "black";
  }

  const lastMove = pgGame.moves[pgGame.moves.length - 1];
  const currentFen =
    lastMove?.fen ??
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <GameBoard
        gameId={pgGame.id}
        status={pgGame.status}
        result={pgGame.result}
        playerRole={playerRole}
        currentFen={currentFen}
        canJoin={false}
        isArchived={true}
        moves={pgGame.moves.map((m) => ({
          moveNumber: m.moveNumber,
          notation: m.notation,
          createdAt: m.createdAt.getTime(),
          fen: m.fen,
        }))}
        timeInitialMs={pgGame.timeInitialMs}
        timeIncrementMs={pgGame.timeIncrementMs}
      />
    </div>
  );
}
