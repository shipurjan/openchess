import { test, expect, Page } from "@playwright/test";
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

async function expectGameOver(page: Page, result: string) {
  await expect(page.getByText("Game over")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(result)).toBeVisible();
}

test.describe("Game End Detection", () => {
  test("resign/draw buttons not visible after game is over", async ({
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

    await expect(
      whitePage.getByRole("button", { name: "Resign" }),
    ).toBeVisible();
    await expect(
      whitePage.getByRole("button", { name: "Offer draw" }),
    ).toBeVisible();

    await resignGame(whitePage);

    await expectGameOver(whitePage, "Black wins");

    await expect(
      whitePage.getByRole("button", { name: "Resign" }),
    ).not.toBeVisible();
    await expect(
      whitePage.getByRole("button", { name: "Offer draw" }),
    ).not.toBeVisible();
    await expect(
      blackPage.getByRole("button", { name: "Resign" }),
    ).not.toBeVisible();
    await expect(
      blackPage.getByRole("button", { name: "Offer draw" }),
    ).not.toBeVisible();

    await whiteContext.close();
    await blackContext.close();
  });
});
