import { prisma } from "@/lib/prisma";
import type { Game } from "@/app/generated/prisma/client";

export type PlayerRole = "white" | "black" | "spectator";

export function getPlayerRole(
  game: Game,
  token: string | undefined,
): PlayerRole {
  if (!token) return "spectator";
  if (token === game.whiteToken) return "white";
  if (token === game.blackToken) return "black";
  return "spectator";
}

export async function assignBlackPlayer(gameId: string) {
  const blackToken = crypto.randomUUID();
  const [updated] = await prisma.game.updateManyAndReturn({
    where: { id: gameId, status: "WAITING", blackToken: null },
    data: { blackToken, status: "IN_PROGRESS" },
  });
  if (!updated) throw new Error("Game already has an opponent");
  return updated;
}
