import { test, expect } from "@playwright/test";
import { cleanDatabase, disconnectDb, getGame } from "./helpers/db";

test.beforeEach(async () => {
  await cleanDatabase();
});

test.afterAll(async () => {
  await disconnectDb();
});

test("POST /api/games returns 201 with game id and token", async ({
  request,
}) => {
  const response = await request.post("/api/games");
  expect(response.status()).toBe(201);

  const body = await response.json();
  expect(body.id).toBeTruthy();
  expect(body.token).toBeTruthy();

  const game = await getGame(body.id);
  expect(game).not.toBeNull();
  expect(game.status).toBe("WAITING");
  expect(game.whiteToken).toBe(body.token);
});

test("POST /api/games sets httpOnly cookie", async ({ request }) => {
  const response = await request.post("/api/games");
  const body = await response.json();

  const setCookieHeader = response.headers()["set-cookie"];
  expect(setCookieHeader).toBeTruthy();
  expect(setCookieHeader).toContain(`chess_token_${body.id}`);
  expect(setCookieHeader).toContain("HttpOnly");
});

test("POST /api/games/[id]/join returns 404 for non-existent game", async ({
  request,
}) => {
  const response = await request.post("/api/games/nonexistent-game-id/join");
  expect(response.status()).toBe(404);
});

test("POST /api/games/[id]/join assigns black player", async ({
  request,
  browser,
}) => {
  const createResponse = await request.post("/api/games");
  const { id } = await createResponse.json();

  const context = await browser.newContext();
  const joinResponse = await context.request.post(
    `http://localhost:3000/api/games/${id}/join`,
  );
  const joinBody = await joinResponse.json();
  expect(joinBody.role).toBe("black");

  const game = await getGame(id);
  expect(game.status).toBe("IN_PROGRESS");
  expect(game.blackToken).toBeTruthy();

  await context.close();
});

test("POST /api/games/[id]/join returns spectator when game is full", async ({
  request,
  browser,
}) => {
  const createResponse = await request.post("/api/games");
  const { id } = await createResponse.json();

  const blackContext = await browser.newContext();
  await blackContext.request.post(
    `http://localhost:3000/api/games/${id}/join`,
  );

  const spectatorContext = await browser.newContext();
  const spectatorResponse = await spectatorContext.request.post(
    `http://localhost:3000/api/games/${id}/join`,
  );
  const spectatorBody = await spectatorResponse.json();
  expect(spectatorBody.role).toBe("spectator");

  await blackContext.close();
  await spectatorContext.close();
});

test("POST /api/games/[id]/join returns existing when player already has token", async ({
  request,
}) => {
  const createResponse = await request.post("/api/games");
  const { id } = await createResponse.json();

  const joinResponse = await request.post(`/api/games/${id}/join`);
  const joinBody = await joinResponse.json();
  expect(joinBody.role).toBe("existing");
});
