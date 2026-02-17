import { test, expect } from "@playwright/test";
import { cleanDatabase, disconnectDb } from "./helpers/db";
import {
  createGameViaUI,
  joinGameViaUI,
  expectPlayingAs,
  waitForWebSocket,
} from "./helpers/game";

test.beforeEach(async () => {
  await cleanDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

test("no 'Opponent disconnected' after color-swap join", async ({
  browser,
}) => {
  const creatorContext = await browser.newContext();
  const creatorPage = await creatorContext.newPage();
  const { url } = await createGameViaUI(creatorPage, {
    creatorColor: "black",
  });

  const joinerContext = await browser.newContext();
  const joinerPage = await joinGameViaUI(joinerContext, url);

  // Creator reloads to pick up the game_update (color swap)
  await creatorPage.reload();
  await creatorPage.waitForLoadState("networkidle");

  // Both players should have WS connections
  await waitForWebSocket(creatorPage);
  await waitForWebSocket(joinerPage);

  // Verify correct color assignments after swap
  await expectPlayingAs(creatorPage, "black");
  await expectPlayingAs(joinerPage, "white");

  // The joiner must NOT see "Opponent disconnected"
  await expect(joinerPage.getByText("Opponent disconnected")).not.toBeVisible();
  await expect(
    creatorPage.getByText("Opponent disconnected"),
  ).not.toBeVisible();

  await creatorContext.close();
  await joinerContext.close();
});
