import { test, expect } from "@playwright/test";
import { cleanDatabase, disconnectDb, getGame } from "./helpers/db";
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

test.describe("Claim Win on Disconnect", () => {
  test("timed game shows countdown when opponent disconnects", async ({
    browser,
  }) => {
    const whiteContext = await browser.newContext();
    const whitePage = await whiteContext.newPage();
    const { url } = await createGameViaUI(whitePage, {
      timeInitialMs: 5 * 60 * 1000,
    });

    const blackContext = await browser.newContext();
    const blackPage = await joinGameViaUI(blackContext, url);

    await whitePage.reload();
    await whitePage.waitForLoadState("networkidle");
    await expectPlayingAs(whitePage, "white");
    await expectPlayingAs(blackPage, "black");

    await blackPage.close();

    await expect(
      whitePage.getByText("Opponent disconnected"),
    ).toBeVisible({ timeout: 5000 });

    // Countdown should be visible (e.g. "(2s)" or "(1s)")
    await expect(whitePage.getByText(/\(\d+s\)/)).toBeVisible({ timeout: 5000 });

    // Claim Win button should NOT be visible yet (countdown > 0)
    await expect(
      whitePage.getByRole("button", { name: "Claim Win" }),
    ).not.toBeVisible();

    await whiteContext.close();
    await blackContext.close();
  });

  test("claim win button appears after countdown and ends the game", async ({
    browser,
  }) => {
    const whiteContext = await browser.newContext();
    const whitePage = await whiteContext.newPage();
    const { url, id } = await createGameViaUI(whitePage, {
      timeInitialMs: 5 * 60 * 1000,
    });

    const blackContext = await browser.newContext();
    const blackPage = await joinGameViaUI(blackContext, url);

    await whitePage.reload();
    await whitePage.waitForLoadState("networkidle");
    await expectPlayingAs(whitePage, "white");
    await expectPlayingAs(blackPage, "black");

    await blackPage.close();

    await expect(
      whitePage.getByText("Opponent disconnected"),
    ).toBeVisible({ timeout: 5000 });

    // Wait for "Claim Win" button to appear (≤2s with env override)
    const claimButton = whitePage.getByRole("button", { name: "Claim Win" });
    await expect(claimButton).toBeVisible({ timeout: 5000 });

    await claimButton.click();

    await expect(whitePage.getByText("Game over")).toBeVisible({ timeout: 5000 });
    await expect(whitePage.getByText("White wins")).toBeVisible();

    const game = await getGame(id);
    expect(game.status).toBe("ABANDONED");

    await whiteContext.close();
    await blackContext.close();
  });

  test("reconnecting before deadline clears countdown", async ({
    browser,
  }) => {
    const whiteContext = await browser.newContext();
    const whitePage = await whiteContext.newPage();
    const { url } = await createGameViaUI(whitePage, {
      timeInitialMs: 5 * 60 * 1000,
    });

    const blackContext = await browser.newContext();
    let blackPage = await joinGameViaUI(blackContext, url);

    await whitePage.reload();
    await whitePage.waitForLoadState("networkidle");
    await expectPlayingAs(whitePage, "white");
    await expectPlayingAs(blackPage, "black");

    await blackPage.close();

    await expect(
      whitePage.getByText("Opponent disconnected"),
    ).toBeVisible({ timeout: 5000 });

    // Countdown should be visible
    await expect(whitePage.getByText(/\(\d+s\)/)).toBeVisible({ timeout: 5000 });

    // Black reconnects
    blackPage = await blackContext.newPage();
    await blackPage.goto(url);
    await blackPage.waitForLoadState("networkidle");

    // Disconnect notification should disappear
    await expect(
      whitePage.getByText("Opponent disconnected"),
    ).not.toBeVisible({ timeout: 5000 });

    // Claim Win button should never appear
    await expect(
      whitePage.getByRole("button", { name: "Claim Win" }),
    ).not.toBeVisible();

    await whiteContext.close();
    await blackContext.close();
  });

  test("unlimited game shows no countdown or claim button on disconnect", async ({
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

    await blackPage.close();

    await expect(
      whitePage.getByText("Opponent disconnected"),
    ).toBeVisible({ timeout: 5000 });

    // No countdown text
    await expect(whitePage.getByText(/\(\d+s\)/)).not.toBeVisible();

    // No Claim Win button
    await expect(
      whitePage.getByRole("button", { name: "Claim Win" }),
    ).not.toBeVisible();

    // Wait 3 seconds — still no Claim Win button
    await whitePage.waitForTimeout(3000);

    await expect(
      whitePage.getByRole("button", { name: "Claim Win" }),
    ).not.toBeVisible();

    await whiteContext.close();
    await blackContext.close();
  });
});
