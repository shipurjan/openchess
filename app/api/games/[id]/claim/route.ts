import { NextResponse } from "next/server";
import { getSeats } from "@/lib/game-session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { token } = body;
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const seats = await getSeats(id);
  if (!seats) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  let role: "white" | "black" | null = null;
  if (token === seats.whiteToken) role = "white";
  else if (token === seats.blackToken) role = "black";

  if (!role) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  const response = NextResponse.json({ role });
  response.cookies.set(`chess_token_${id}`, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
