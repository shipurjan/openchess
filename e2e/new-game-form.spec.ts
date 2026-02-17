import { test, expect } from "@playwright/test";
import { cleanDatabase, disconnectDb } from "./helpers/db";

test.beforeEach(async () => {
  await cleanDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

test.describe("New Game Form", () => {
  test("creating a game via the form redirects to game page", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/new");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Create Game" }).click();

    await expect(async () => {
      expect(page.url()).toMatch(/\/game\/[a-f0-9-]+$/);
    }).toPass({ timeout: 10000 });

    await expect(page.getByText("Waiting for opponent...")).toBeVisible({
      timeout: 10000,
    });

    await context.close();
  });

  test("unlimited toggle hides time controls", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/new");
    await page.waitForLoadState("networkidle");

    // Time controls visible by default
    await expect(page.getByText("Minutes:", { exact: false })).toBeVisible();

    // Toggle unlimited
    await page
      .locator("label", { hasText: "Unlimited" })
      .locator("button[role='switch']")
      .click();

    // Time controls hidden
    await expect(
      page.getByText("Minutes:", { exact: false }),
    ).not.toBeVisible();

    await context.close();
  });
});
