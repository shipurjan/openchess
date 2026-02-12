import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getGame, joinGame } from "@/lib/game-session";
import { gameEvents } from "@/lib/game-events";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(`chess_token_${id}`)?.value;

  if (existingToken) {
    return NextResponse.json({ role: "existing" });
  }

  const game = await getGame(id);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.status !== "WAITING" || game.blackToken) {
    return NextResponse.json({ role: "spectator" });
  }

  const result = await joinGame(id);
  if (!result) {
    return NextResponse.json({ role: "spectator" });
  }

  gameEvents.emit("game_updated", id, "IN_PROGRESS");

  const response = NextResponse.json({ role: result.role });
  response.cookies.set(`chess_token_${id}`, result.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
