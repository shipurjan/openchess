import { test, expect } from "@playwright/test";
import { cleanDatabase, disconnectDb, getGame } from "./helpers/db";
import {
  createGameViaUI,
  joinGameViaUI,
  getGameCookie,
  expectPlayingAs,
} from "./helpers/game";

test.beforeEach(async () => {
  await cleanDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

test("second player joins as black and DB updates to IN_PROGRESS", async ({
  browser,
}) => {
  const whiteContext = await browser.newContext();
  const whitePage = await whiteContext.newPage();
  const { url, id } = await createGameViaUI(whitePage);

  const blackContext = await browser.newContext();
  const blackPage = await joinGameViaUI(blackContext, url);

  const game = await getGame(id);
  expect(game).not.toBeNull();
  expect(game.status).toBe("IN_PROGRESS");
  expect(game.blackToken).toBeTruthy();

  const blackCookie = await getGameCookie(blackContext, id);
  expect(blackCookie).toBeDefined();
  expect(blackCookie!.value).toBe(game.blackToken);

  await expectPlayingAs(blackPage, "black");

  await whiteContext.close();
  await blackContext.close();
});

test("white player sees playing state after refresh", async ({ browser }) => {
  const whiteContext = await browser.newContext();
  const whitePage = await whiteContext.newPage();
  const { url } = await createGameViaUI(whitePage);

  const blackContext = await browser.newContext();
  await joinGameViaUI(blackContext, url);

  await whitePage.reload();
  await whitePage.waitForLoadState("networkidle");

  await expectPlayingAs(whitePage, "white");

  await whiteContext.close();
  await blackContext.close();
});

test("white player sees playing state automatically when opponent joins", async ({
  browser,
}) => {
  const whiteContext = await browser.newContext();
  const whitePage = await whiteContext.newPage();
  const { url } = await createGameViaUI(whitePage);

  await expect(whitePage.getByText("Waiting for opponent...")).toBeVisible();

  const blackContext = await browser.newContext();
  await joinGameViaUI(blackContext, url);

  await expectPlayingAs(whitePage, "white");

  await whiteContext.close();
  await blackContext.close();
});

test("non-existent game returns 404", async ({ page }) => {
  const response = await page.goto("/game/nonexistent-id-12345");
  expect(response!.status()).toBe(404);
});
