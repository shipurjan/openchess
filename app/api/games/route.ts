import { NextRequest, NextResponse } from "next/server";
import { createGame, canCreateGame } from "@/lib/game-session";
import { checkRateLimit, GAME_CREATION_RATE_LIMIT } from "@/lib/rate-limit";

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP;

  return "127.0.0.1";
}

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request);

  const rateLimitResult = await checkRateLimit(
    clientIP,
    "game-create",
    GAME_CREATION_RATE_LIMIT,
  );

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      {
        error: "Too many requests",
        retryAfter: rateLimitResult.retryAfterSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimitResult.retryAfterSeconds ?? 60),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const activeGamesCheck = await canCreateGame(clientIP);
  if (!activeGamesCheck.allowed) {
    return NextResponse.json(
      {
        error: "Too many active games",
        message: `You have ${activeGamesCheck.activeCount} active games. Maximum allowed is ${activeGamesCheck.limit}.`,
        activeCount: activeGamesCheck.activeCount,
        limit: activeGamesCheck.limit,
      },
      {
        status: 429,
        headers: {
          "X-Active-Games": String(activeGamesCheck.activeCount),
          "X-Active-Games-Limit": String(activeGamesCheck.limit),
        },
      },
    );
  }

  let isPublic = false;
  let timeInitialMs = 0;
  let timeIncrementMs = 0;
  let creatorColor: "white" | "black" | "random" = "white";
  try {
    const body = await request.json();
    isPublic = body.isPublic === true;
    if (typeof body.timeInitialMs === "number" && body.timeInitialMs >= 0) {
      timeInitialMs = Math.min(body.timeInitialMs, 3 * 60 * 60 * 1000);
    }
    if (
      typeof body.timeIncrementMs === "number" &&
      body.timeIncrementMs >= 0
    ) {
      timeIncrementMs = Math.min(body.timeIncrementMs, 5 * 60 * 1000);
    }
    if (
      body.creatorColor === "white" ||
      body.creatorColor === "black" ||
      body.creatorColor === "random"
    ) {
      creatorColor = body.creatorColor;
    }
  } catch {
    // Empty body is fine — defaults to private untimed
  }

  const { gameId, whiteToken } = await createGame({
    isPublic,
    creatorIP: clientIP,
    timeInitialMs,
    timeIncrementMs,
    creatorColor,
  });

  const response = NextResponse.json(
    { id: gameId, token: whiteToken },
    {
      status: 201,
      headers: {
        "X-RateLimit-Remaining": String(rateLimitResult.remaining),
      },
    },
  );

  response.cookies.set(`chess_token_${gameId}`, whiteToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
