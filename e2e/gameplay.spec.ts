import { test, expect, Page } from "@playwright/test";
import { cleanDatabase, disconnectDb } from "./helpers/db";
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

async function setupGame(browser: import("@playwright/test").Browser) {
  const whiteContext = await browser.newContext();
  const whitePage = await whiteContext.newPage();
  const { url } = await createGameViaUI(whitePage);

  const blackContext = await browser.newContext();
  const blackPage = await joinGameViaUI(blackContext, url);

  await whitePage.reload();
  await whitePage.waitForLoadState("networkidle");
  await expectPlayingAs(whitePage, "white");
  await expectPlayingAs(blackPage, "black");

  return { whiteContext, whitePage, blackContext, blackPage };
}

async function expectGameOver(page: Page, result: string) {
  await expect(page.getByText("Game over")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(result)).toBeVisible();
}

test.describe("Gameplay", () => {
  test("move syncs to opponent and appears in move list", async ({
    browser,
  }) => {
    const { whiteContext, whitePage, blackContext, blackPage } =
      await setupGame(browser);

    await makeMove(whitePage, "e2", "e4");

    const whiteMoveList = whitePage.getByTestId("move-list");
    await expect(whiteMoveList.getByText("1.")).toBeVisible({ timeout: 5000 });
    await expect(whiteMoveList.getByText("e4")).toBeVisible();

    const blackMoveList = blackPage.getByTestId("move-list");
    await expect(blackMoveList.getByText("1.")).toBeVisible({ timeout: 5000 });
    await expect(blackMoveList.getByText("e4")).toBeVisible();

    await makeMove(blackPage, "e7", "e5");

    await expect(whiteMoveList.getByText("e5")).toBeVisible({ timeout: 5000 });
    await expect(blackMoveList.getByText("e5")).toBeVisible({ timeout: 5000 });

    await whiteContext.close();
    await blackContext.close();
  });

  test("checkmate ends the game for both players", async ({ browser }) => {
    const { whiteContext, whitePage, blackContext, blackPage } =
      await setupGame(browser);

    // Scholar's Mate
    await makeMove(whitePage, "e2", "e4");
    await expect(blackPage.getByTestId("move-list").getByText("e4")).toBeVisible({ timeout: 5000 });

    await makeMove(blackPage, "e7", "e5");
    await expect(whitePage.getByTestId("move-list").getByText("e5")).toBeVisible({ timeout: 5000 });

    await makeMove(whitePage, "d1", "h5");
    await expect(blackPage.getByTestId("move-list").getByText("Qh5")).toBeVisible({ timeout: 5000 });

    await makeMove(blackPage, "b8", "c6");
    await expect(whitePage.getByTestId("move-list").getByText("Nc6")).toBeVisible({ timeout: 5000 });

    await makeMove(whitePage, "f1", "c4");
    await expect(blackPage.getByTestId("move-list").getByText("Bc4")).toBeVisible({ timeout: 5000 });

    await makeMove(blackPage, "g8", "f6");
    await expect(whitePage.getByTestId("move-list").getByText("Nf6")).toBeVisible({ timeout: 5000 });

    await makeMove(whitePage, "h5", "f7");

    await expectGameOver(whitePage, "White wins");
    await expectGameOver(blackPage, "White wins");

    await expect(
      whitePage.getByRole("button", { name: "Resign" }),
    ).not.toBeVisible();

    await whiteContext.close();
    await blackContext.close();
  });

  test("draw offer accepted ends game as draw", async ({ browser }) => {
    const { whiteContext, whitePage, blackContext, blackPage } =
      await setupGame(browser);

    await whitePage.getByRole("button", { name: "Offer draw" }).click();

    await expect(
      blackPage.getByText("Your opponent offers a draw"),
    ).toBeVisible({ timeout: 5000 });

    await blackPage.getByRole("button", { name: "Accept" }).click();

    await expectGameOver(whitePage, "Draw");
    await expectGameOver(blackPage, "Draw");

    await whiteContext.close();
    await blackContext.close();
  });

  test("draw offer declined lets game continue", async ({ browser }) => {
    const { whiteContext, whitePage, blackContext, blackPage } =
      await setupGame(browser);

    await whitePage.getByRole("button", { name: "Offer draw" }).click();

    await expect(
      blackPage.getByText("Your opponent offers a draw"),
    ).toBeVisible({ timeout: 5000 });

    await blackPage.getByRole("button", { name: "Decline" }).click();

    await expect(
      blackPage.getByText("Your opponent offers a draw"),
    ).not.toBeVisible({ timeout: 5000 });

    // Game still in progress — Resign button visible
    await expect(
      whitePage.getByRole("button", { name: "Resign" }),
    ).toBeVisible();
    await expect(
      blackPage.getByRole("button", { name: "Resign" }),
    ).toBeVisible();

    await whiteContext.close();
    await blackContext.close();
  });
});
