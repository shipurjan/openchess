import { NextResponse } from "next/server";
import { getPublicGames, getRoomInfo } from "@/lib/game-session";

export async function GET() {
  const games = await getPublicGames(20);

  const gamesWithInfo = await Promise.all(
    games.map(async (game) => {
      const { players, spectators } = await getRoomInfo(game.id);
      return { ...game, players, spectators };
    }),
  );

  const activeGames = gamesWithInfo.filter((game) => game.players > 0);

  return NextResponse.json({ games: activeGames });
}
