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

test.describe("Archive", () => {
  test("finished game appears on archive page", async ({ browser }) => {
    const whiteContext = await browser.newContext();
    const whitePage = await whiteContext.newPage();
    const { url } = await createGameViaUI(whitePage);

    const blackContext = await browser.newContext();
    const blackPage = await joinGameViaUI(blackContext, url);

    await whitePage.reload();
    await whitePage.waitForLoadState("networkidle");
    await expectPlayingAs(whitePage, "white");
    await expectPlayingAs(blackPage, "black");

    await resignGame(whitePage);

    await expect(whitePage.getByText("Game over")).toBeVisible({
      timeout: 5000,
    });
    await expect(blackPage.getByText("Game over")).toBeVisible({
      timeout: 5000,
    });

    // Close both contexts to trigger archiveAndDeleteGame when room empties
    await whiteContext.close();
    await blackContext.close();

    // Wait for archival to complete
    await new Promise((r) => setTimeout(r, 2000));

    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await viewerPage.goto("/archive");
    await viewerPage.waitForLoadState("networkidle");

    await expect(viewerPage.getByText("Black wins")).toBeVisible({
      timeout: 10000,
    });
    await expect(
      viewerPage.getByText("No archived games"),
    ).not.toBeVisible();

    await viewerContext.close();
  });
});
