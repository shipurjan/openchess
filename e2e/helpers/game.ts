import type { Page, BrowserContext } from "@playwright/test";
import { expect } from "@playwright/test";

export interface CreateGameOptions {
  isPublic?: boolean;
  timeInitialMs?: number;
  timeIncrementMs?: number;
}

export async function createGameViaUI(
  page: Page,
  options: CreateGameOptions = {},
) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const gameId = await page.evaluate(async (opts: CreateGameOptions) => {
    const res = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isPublic: opts.isPublic ?? false,
        timeInitialMs: opts.timeInitialMs,
        timeIncrementMs: opts.timeIncrementMs,
      }),
    });
    if (!res.ok) throw new Error(`Failed to create game: ${res.status}`);
    const data = await res.json();
    if (!data.id)
      throw new Error(`No game ID returned: ${JSON.stringify(data)}`);
    return data.id;
  }, options);

  const url = `${new URL(page.url()).origin}/game/${gameId}`;
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  return { url, id: gameId };
}

export async function joinGameViaUI(
  context: BrowserContext,
  gameUrl: string,
) {
  const page = await context.newPage();

  const origin = new URL(gameUrl).origin;
  await page.goto(origin);
  await page.waitForLoadState("networkidle");

  const gameId = gameUrl.split("/game/")[1];

  await page.evaluate(async (id: string) => {
    await fetch(`/api/games/${id}/join`, { method: "POST" });
  }, gameId);

  await page.goto(gameUrl);
  await page.waitForLoadState("networkidle");

  return page;
}

export async function getGameCookie(
  context: BrowserContext,
  gameId: string,
) {
  const cookies = await context.cookies();
  return cookies.find((c) => c.name === `chess_token_${gameId}`);
}

export async function expectWaitingState(page: Page) {
  await expect(page.getByText("Waiting for opponent...")).toBeVisible({
    timeout: 10000,
  });
  await expect(
    page.getByRole("button", { name: "Copy invite link" }),
  ).toBeVisible({ timeout: 10000 });
}

export async function waitForWebSocket(page: Page) {
  await expect(
    page.locator('[data-ws-connected="true"]'),
  ).toBeVisible({ timeout: 15000 });
}

export async function expectPlayingAs(
  page: Page,
  role: "white" | "black",
) {
  await expect(
    page.getByText(`You are playing as ${role}`),
  ).toBeVisible();
  await waitForWebSocket(page);
}

export async function expectSpectating(page: Page) {
  await expect(
    page.getByText("Spectating", { exact: true }),
  ).toBeVisible();
}

/**
 * Click resign with confirmation (two clicks: "Resign" then "Are you sure?").
 */
export async function resignGame(page: Page) {
  await page.getByRole("button", { name: "Resign" }).click();
  await page.getByRole("button", { name: "Are you sure?" }).click();
}
