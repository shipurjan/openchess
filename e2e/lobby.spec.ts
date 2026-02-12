import { test, expect } from "@playwright/test";
import { cleanDatabase, disconnectDb } from "./helpers/db";
import { createGameViaUI } from "./helpers/game";

test.beforeEach(async () => {
  await cleanDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

test.describe("Public/Private Lobbies", () => {
  test("home page shows new game button and public games heading", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "New Game" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Public Games" }),
    ).toBeVisible();
  });

  test("creating a private game via /new shows waiting state", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await createGameViaUI(page);

    await expect(page.getByText("Waiting for opponent...")).toBeVisible();

    await context.close();
  });

  test("creating a public game via /new shows waiting state", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await createGameViaUI(page, { isPublic: true });

    await expect(page.getByText("Waiting for opponent...")).toBeVisible();

    await context.close();
  });

  test("home page shows no games initially", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText("No public games available"),
    ).toBeVisible();
  });

  test("public games appear on the home page", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await createGameViaUI(page, { isPublic: true });

    const context2 = await browser.newContext();
    const homePage = await context2.newPage();
    await homePage.goto("/");

    await expect(homePage.getByText("1/2 players")).toBeVisible();

    await context.close();
    await context2.close();
  });

  test("private games do not appear on the home page", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await createGameViaUI(page);

    const context2 = await browser.newContext();
    const homePage = await context2.newPage();
    await homePage.goto("/");

    await expect(
      homePage.getByText("No public games available"),
    ).toBeVisible();

    await context.close();
    await context2.close();
  });

  test("home page shows multiple public games", async ({ browser }) => {
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();

    await page1.goto("/");
    await page1.waitForLoadState("networkidle");
    await page1.evaluate(async () => {
      await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: true }),
      });
    });

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();

    await page2.goto("/");
    await page2.waitForLoadState("networkidle");
    await page2.evaluate(async () => {
      await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: true }),
      });
    });

    const context3 = await browser.newContext();
    const homePage = await context3.newPage();
    await homePage.goto("/");

    const lobbyTiles = homePage.getByRole("link", { name: /players/ });
    await expect(lobbyTiles).toHaveCount(2);

    await context1.close();
    await context2.close();
    await context3.close();
  });
});
