import { test, expect } from "@playwright/test";
import { cleanDatabase, disconnectDb } from "./helpers/db";
import {
  createGameViaUI,
  joinGameViaUI,
  expectPlayingAs,
  expectSpectating,
} from "./helpers/game";

test.beforeEach(async () => {
  await cleanDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

test.describe("Spectating", () => {
  test("third player sees spectating view", async ({ browser }) => {
    const whiteContext = await browser.newContext();
    const whitePage = await whiteContext.newPage();
    const { url } = await createGameViaUI(whitePage);

    const blackContext = await browser.newContext();
    const blackPage = await joinGameViaUI(blackContext, url);

    await whitePage.reload();
    await whitePage.waitForLoadState("networkidle");
    await expectPlayingAs(whitePage, "white");
    await expectPlayingAs(blackPage, "black");

    // Third browser visits the game
    const spectatorContext = await browser.newContext();
    const spectatorPage = await spectatorContext.newPage();
    await spectatorPage.goto(url);
    await spectatorPage.waitForLoadState("networkidle");

    await expectSpectating(spectatorPage);

    await expect(
      spectatorPage.getByRole("button", { name: "Resign" }),
    ).not.toBeVisible();
    await expect(
      spectatorPage.getByRole("button", { name: "Offer draw" }),
    ).not.toBeVisible();

    // Both players see "1 spectator watching"
    await expect(
      whitePage.getByText("1 spectator watching"),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      blackPage.getByText("1 spectator watching"),
    ).toBeVisible({ timeout: 5000 });

    await whiteContext.close();
    await blackContext.close();
    await spectatorContext.close();
  });
});
