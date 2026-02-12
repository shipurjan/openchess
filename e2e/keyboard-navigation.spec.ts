import { test, expect } from "@playwright/test";
import { cleanDatabase, disconnectDb } from "./helpers/db";
import {
  createGameViaUI,
  joinGameViaUI,
  expectPlayingAs,
  resignGame,
} from "./helpers/game";

test.beforeEach(async () => {
  await cleanDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

async function endGameByResign(page: import("@playwright/test").Page) {
  await resignGame(page);
  await expect(page.getByText("Game over")).toBeVisible({ timeout: 5000 });
}

test.describe("Keyboard Navigation for Move Review", () => {
  test("no review controls shown when game ends with no moves", async ({
    browser,
  }) => {
    const whiteContext = await browser.newContext();
    const whitePage = await whiteContext.newPage();
    const { url } = await createGameViaUI(whitePage);

    const blackContext = await browser.newContext();
    const blackPage = await joinGameViaUI(blackContext, url);

    await whitePage.reload();
    await whitePage.waitForLoadState("networkidle");
    await expectPlayingAs(whitePage, "white");
    await expectPlayingAs(blackPage, "black");

    await endGameByResign(whitePage);

    await expect(
      whitePage.getByRole("button", { name: /Go to start/i }),
    ).not.toBeVisible();
    await expect(
      whitePage.locator('[aria-live="polite"]'),
    ).not.toBeVisible();

    await whiteContext.close();
    await blackContext.close();
  });
});
