import { test, expect } from "@playwright/test";
import { cleanDatabase, disconnectDb, getGame } from "./helpers/db";
import {
  createGameViaUI,
  joinGameViaUI,
  getGameCookie,
  expectPlayingAs,
} from "./helpers/game";

test.beforeEach(async () => {
  await cleanDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

test("player can create multiple games with separate cookies", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  const { id: id1 } = await createGameViaUI(page);
  const cookie1 = await getGameCookie(context, id1);
  expect(cookie1).toBeDefined();

  const { id: id2 } = await createGameViaUI(page);
  const cookie2 = await getGameCookie(context, id2);
  expect(cookie2).toBeDefined();

  expect(id1).not.toBe(id2);

  const allCookies = await context.cookies();
  const gameCookies = allCookies.filter((c) =>
    c.name.startsWith("chess_token_"),
  );
  expect(gameCookies.length).toBeGreaterThanOrEqual(2);

  await context.close();
});

test("joining one game does not affect another game", async ({ browser }) => {
  const white1Context = await browser.newContext();
  const white1Page = await white1Context.newPage();
  const { url: url1, id: id1 } = await createGameViaUI(white1Page);

  const white2Context = await browser.newContext();
  const white2Page = await white2Context.newPage();
  const { id: id2 } = await createGameViaUI(white2Page);

  const blackContext = await browser.newContext();
  await joinGameViaUI(blackContext, url1);

  const game1 = await getGame(id1);
  expect(game1.status).toBe("IN_PROGRESS");

  const game2 = await getGame(id2);
  expect(game2.status).toBe("WAITING");

  await white1Context.close();
  await white2Context.close();
  await blackContext.close();
});

test("black player revisiting game page keeps their role", async ({
  browser,
}) => {
  const whiteContext = await browser.newContext();
  const whitePage = await whiteContext.newPage();
  const { url } = await createGameViaUI(whitePage);

  const blackContext = await browser.newContext();
  const blackPage = await joinGameViaUI(blackContext, url);
  await expectPlayingAs(blackPage, "black");

  await blackPage.goto("/");
  await blackPage.goto(url);
  await blackPage.waitForLoadState("networkidle");

  await expectPlayingAs(blackPage, "black");

  await whiteContext.close();
  await blackContext.close();
});
