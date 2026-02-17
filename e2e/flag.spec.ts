import { test, expect } from "@playwright/test";
import { cleanDatabase, disconnectDb, getGame } from "./helpers/db";
import {
  createGameViaUI,
  joinGameViaUI,
  expectPlayingAs,
  makeMove,
} from "./helpers/game";

test.beforeEach(async () => {
  await cleanDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

test.describe("Clock Flag", () => {
  test("game ends when clock runs out", async ({ browser }) => {
    const whiteContext = await browser.newContext();
    const whitePage = await whiteContext.newPage();
    const { url, id } = await createGameViaUI(whitePage, {
      timeInitialMs: 5000,
    });

    const blackContext = await browser.newContext();
    const blackPage = await joinGameViaUI(blackContext, url);

    await whitePage.reload();
    await whitePage.waitForLoadState("networkidle");
    await expectPlayingAs(whitePage, "white");
    await expectPlayingAs(blackPage, "black");

    // White plays e4 — starts black's clock
    await makeMove(whitePage, "e2", "e4");
    await expect(
      blackPage.getByTestId("move-list").getByText("e4"),
    ).toBeVisible({ timeout: 5000 });

    // Wait for black's 5s clock to expire
    await expect(whitePage.getByText("Game over")).toBeVisible({
      timeout: 10000,
    });
    await expect(whitePage.getByText("White wins")).toBeVisible({
      timeout: 10000,
    });
    await expect(blackPage.getByText("Game over")).toBeVisible({
      timeout: 10000,
    });
    await expect(blackPage.getByText("White wins")).toBeVisible({
      timeout: 10000,
    });

    const game = await getGame(id);
    expect(game.status).toBe("FINISHED");

    await whiteContext.close();
    await blackContext.close();
  });
});
