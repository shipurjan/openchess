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

test.describe("Disconnect Handling", () => {
  test("disconnect notification disappears when opponent reconnects", async ({
    browser,
  }) => {
    const whiteContext = await browser.newContext();
    const whitePage = await whiteContext.newPage();
    const { url } = await createGameViaUI(whitePage);

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

    blackPage = await blackContext.newPage();
    await blackPage.goto(url);
    await blackPage.waitForLoadState("networkidle");

    await expect(
      whitePage.getByText("Opponent disconnected"),
    ).not.toBeVisible({ timeout: 5000 });

    await whiteContext.close();
    await blackContext.close();
  });

  test("white player disconnects and black sees notification", async ({
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

    await whitePage.close();

    await expect(
      blackPage.getByText("Opponent disconnected"),
    ).toBeVisible({ timeout: 5000 });

    await whiteContext.close();
    await blackContext.close();
  });

});
