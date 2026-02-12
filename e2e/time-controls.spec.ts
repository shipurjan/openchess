import { test, expect } from "@playwright/test";
import { cleanDatabase, disconnectDb } from "./helpers/db";
import {
  createGameViaUI,
  joinGameViaUI,
  waitForWebSocket,
  expectPlayingAs,
} from "./helpers/game";

test.beforeEach(async () => {
  await cleanDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

test("white player sees correct clock times after black joins a timed game", async ({
  browser,
}) => {
  const whiteContext = await browser.newContext();
  const whitePage = await whiteContext.newPage();
  const { url } = await createGameViaUI(whitePage, {
    timeInitialMs: 5 * 60 * 1000,
    timeIncrementMs: 3000,
  });

  await expect(whitePage.getByText("Waiting for opponent...")).toBeVisible();
  await waitForWebSocket(whitePage);

  const blackContext = await browser.newContext();
  const blackPage = await joinGameViaUI(blackContext, url);

  await expectPlayingAs(whitePage, "white");
  await expectPlayingAs(blackPage, "black");

  await expect(async () => {
    const whiteClocks = whitePage.locator('[class*="font-mono"]');
    const whiteClockTexts = await whiteClocks.allTextContents();
    expect(whiteClockTexts.length).toBe(2);
    for (const text of whiteClockTexts) {
      expect(text).not.toBe("0:00");
      expect(text).toMatch(/^[4-5]:\d{2}$/);
    }
  }).toPass({ timeout: 5000 });

  const blackClocks = blackPage.locator('[class*="font-mono"]');
  const blackClockTexts = await blackClocks.allTextContents();
  expect(blackClockTexts.length).toBe(2);
  for (const text of blackClockTexts) {
    expect(text).not.toBe("0:00");
    expect(text).toMatch(/^[4-5]:\d{2}$/);
  }

  await whiteContext.close();
  await blackContext.close();
});
