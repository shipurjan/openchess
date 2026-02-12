import { test, expect } from "@playwright/test";
import { cleanDatabase, disconnectDb, getGame } from "./helpers/db";
import { createGameViaUI, getGameCookie } from "./helpers/game";

test.beforeEach(async () => {
  await cleanDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

test("clicking New Game creates a game and redirects to game page", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  const { id } = await createGameViaUI(page);
  expect(id).toBeTruthy();

  const game = await getGame(id);
  expect(game).not.toBeNull();
  expect(game.status).toBe("WAITING");
  expect(game.blackToken).toBeNull();
  expect(game.whiteToken).toBeTruthy();

  const cookie = await getGameCookie(context, id);
  expect(cookie).toBeDefined();
  expect(cookie!.value).toBe(game.whiteToken);

  await context.close();
});
