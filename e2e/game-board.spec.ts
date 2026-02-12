import { test, expect } from "@playwright/test";
import { cleanDatabase, disconnectDb } from "./helpers/db";
import {
  createGameViaUI,
  joinGameViaUI,
  expectPlayingAs,
} from "./helpers/game";

test.beforeEach(async () => {
  await cleanDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

test("chess board is visible on game page", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await createGameViaUI(page);

  await expect(page.locator("[data-square='e2']")).toBeVisible();

  await context.close();
});

test("white player sees board oriented as white", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await createGameViaUI(page);

  await expect(page.locator("[data-square='e2']")).toBeVisible();

  await context.close();
});

test("black player sees board oriented as black", async ({ browser }) => {
  const whiteContext = await browser.newContext();
  const whitePage = await whiteContext.newPage();
  const { url } = await createGameViaUI(whitePage);

  const blackContext = await browser.newContext();
  const blackPage = await joinGameViaUI(blackContext, url);

  await expectPlayingAs(blackPage, "black");
  await expect(blackPage.locator("[data-square='e7']")).toBeVisible();

  await whiteContext.close();
  await blackContext.close();
});

test("copy invite link button works in waiting state", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await createGameViaUI(page);

  const copyButton = page.getByRole("button", { name: "Copy invite link" });
  await copyButton.click();

  await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Copy invite link" }),
  ).toBeVisible({ timeout: 5000 });

  await context.close();
});

test("no move history shown for new game", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await createGameViaUI(page);

  await expect(page.getByText("No moves yet")).toBeVisible();

  await context.close();
});

test("white sees playing state after black joins and white refreshes", async ({
  browser,
}) => {
  const whiteContext = await browser.newContext();
  const whitePage = await whiteContext.newPage();
  const { url } = await createGameViaUI(whitePage);

  await expect(whitePage.getByText("Waiting for opponent...")).toBeVisible();

  const blackContext = await browser.newContext();
  await joinGameViaUI(blackContext, url);

  await whitePage.reload();
  await whitePage.waitForLoadState("networkidle");
  await expectPlayingAs(whitePage, "white");

  await expect(
    whitePage.getByRole("button", { name: "Copy invite link" }),
  ).not.toBeVisible();

  await whiteContext.close();
  await blackContext.close();
});
