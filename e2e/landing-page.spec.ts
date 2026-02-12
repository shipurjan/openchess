import { test, expect } from "@playwright/test";

test("landing page renders heading and description", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "OpenChess" })).toBeVisible();
  await expect(
    page.getByText("Anonymous real-time chess"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "New Game" })).toBeVisible();
});

test("New Game link navigates to game creation page", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "New Game" }).click();

  await page.waitForURL("/new");
  expect(page.url()).toMatch(/\/new$/);
});
