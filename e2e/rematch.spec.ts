import { test, expect, Page } from "@playwright/test";
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

async function expectGameOver(page: Page, result: string) {
  await expect(page.getByText("Game over")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(result)).toBeVisible();
}

test.describe("Rematch", () => {
  test("both players get correct roles after rematch (colors swap)", async ({
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

    await whitePage.getByRole("button", { name: "Resign" }).click();
    await expectGameOver(whitePage, "Black wins");
    await expectGameOver(blackPage, "Black wins");

    await whitePage.getByRole("button", { name: "Rematch" }).click();
    await expect(whitePage.getByText("Rematch offered")).toBeVisible();

    await expect(
      blackPage.getByText("Opponent wants a rematch"),
    ).toBeVisible({ timeout: 5000 });
    await blackPage.getByRole("button", { name: "Accept" }).click();

    const originalWhiteUrl = whitePage.url();

    await expect(async () => {
      expect(whitePage.url()).not.toBe(originalWhiteUrl);
    }).toPass({ timeout: 10000 });
    await expect(async () => {
      expect(blackPage.url()).toContain("/game/");
    }).toPass({ timeout: 10000 });

    await whitePage.reload();
    await whitePage.waitForLoadState("networkidle");
    await blackPage.reload();
    await blackPage.waitForLoadState("networkidle");

    await waitForWebSocket(whitePage);
    await waitForWebSocket(blackPage);

    await expectPlayingAs(whitePage, "black");
    await expectPlayingAs(blackPage, "white");

    await whiteContext.close();
    await blackContext.close();
  });

  test("players can resign in rematch game without page reload", async ({
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

    await whitePage.getByRole("button", { name: "Resign" }).click();
    await expectGameOver(whitePage, "Black wins");
    await expectGameOver(blackPage, "Black wins");

    await whitePage.getByRole("button", { name: "Rematch" }).click();
    await expect(whitePage.getByText("Rematch offered")).toBeVisible();

    await expect(
      blackPage.getByText("Opponent wants a rematch"),
    ).toBeVisible({ timeout: 5000 });
    await blackPage.getByRole("button", { name: "Accept" }).click();

    const originalWhiteUrl = whitePage.url();
    await expect(async () => {
      expect(whitePage.url()).not.toBe(originalWhiteUrl);
    }).toPass({ timeout: 10000 });
    await expect(async () => {
      expect(blackPage.url()).toContain("/game/");
    }).toPass({ timeout: 10000 });

    await waitForWebSocket(whitePage);
    await waitForWebSocket(blackPage);

    await expectPlayingAs(whitePage, "black");
    await expectPlayingAs(blackPage, "white");

    await blackPage.getByRole("button", { name: "Resign" }).click();
    await expectGameOver(whitePage, "Black wins");
    await expectGameOver(blackPage, "Black wins");

    await whiteContext.close();
    await blackContext.close();
  });

  test("double rematch works (tokens don't collide in archive)", async ({
    browser,
  }) => {
    const playerAContext = await browser.newContext();
    const playerAPage = await playerAContext.newPage();
    const { url } = await createGameViaUI(playerAPage);

    const playerBContext = await browser.newContext();
    const playerBPage = await joinGameViaUI(playerBContext, url);

    await playerAPage.reload();
    await playerAPage.waitForLoadState("networkidle");
    await expectPlayingAs(playerAPage, "white");
    await expectPlayingAs(playerBPage, "black");

    // Game 1: resign then rematch
    await playerAPage.getByRole("button", { name: "Resign" }).click();
    await expectGameOver(playerAPage, "Black wins");
    await expectGameOver(playerBPage, "Black wins");

    let prevUrl = playerAPage.url();
    await playerAPage.getByRole("button", { name: "Rematch" }).click();
    await expect(
      playerBPage.getByText("Opponent wants a rematch"),
    ).toBeVisible({ timeout: 5000 });
    await playerBPage.getByRole("button", { name: "Accept" }).click();

    await expect(async () => {
      expect(playerAPage.url()).not.toBe(prevUrl);
    }).toPass({ timeout: 10000 });
    await playerAPage.reload();
    await playerAPage.waitForLoadState("networkidle");
    await playerBPage.reload();
    await playerBPage.waitForLoadState("networkidle");
    await waitForWebSocket(playerAPage);
    await waitForWebSocket(playerBPage);

    await expectPlayingAs(playerAPage, "black");
    await expectPlayingAs(playerBPage, "white");

    // Game 2: resign then rematch again
    await playerBPage.getByRole("button", { name: "Resign" }).click();
    await expectGameOver(playerAPage, "Black wins");
    await expectGameOver(playerBPage, "Black wins");

    prevUrl = playerAPage.url();
    await playerAPage.getByRole("button", { name: "Rematch" }).click();
    await expect(
      playerBPage.getByText("Opponent wants a rematch"),
    ).toBeVisible({ timeout: 5000 });
    await playerBPage.getByRole("button", { name: "Accept" }).click();

    await expect(async () => {
      expect(playerAPage.url()).not.toBe(prevUrl);
    }).toPass({ timeout: 10000 });
    await playerAPage.reload();
    await playerAPage.waitForLoadState("networkidle");
    await playerBPage.reload();
    await playerBPage.waitForLoadState("networkidle");
    await waitForWebSocket(playerAPage);
    await waitForWebSocket(playerBPage);

    await expectPlayingAs(playerAPage, "white");
    await expectPlayingAs(playerBPage, "black");

    // Game 3: resign — triggers archive with cycled tokens
    await playerAPage.getByRole("button", { name: "Resign" }).click();
    await expectGameOver(playerAPage, "Black wins");
    await expectGameOver(playerBPage, "Black wins");

    await playerAContext.close();
    await playerBContext.close();
  });
});
