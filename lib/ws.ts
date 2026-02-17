import { WebSocketServer, WebSocket } from "ws";
import type { Server, IncomingMessage } from "http";
import type { Socket } from "net";
import { Chess } from "chess.js";
import { gameEvents } from "./game-events";
import { parseCookies } from "./cookies";
import * as session from "./game-session";
import { validateMessage, checkMessageSize } from "./ws-validation";
import { checkRateLimit, WS_CONNECTION_RATE_LIMIT } from "./rate-limit";
import { logger } from "./logger";
import { validateWebSocketOrigin, getCorsHeaders } from "./cors";

interface ClientData {
  gameId: string | null;
  token: string | null;
  playerColor: "white" | "black" | null;
  cookies: Map<string, string>;
  isAlive: boolean;
}

const rooms = new Map<string, Set<WebSocket>>();
const clientData = new WeakMap<WebSocket, ClientData>();

function getClientIP(req: IncomingMessage, socket: Socket): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const str = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return str.split(",")[0].trim();
  }

  const realIP = req.headers["x-real-ip"];
  if (realIP) {
    return Array.isArray(realIP) ? realIP[0] : realIP;
  }

  return socket.remoteAddress ?? "unknown";
}

function broadcastToOthers(
  gameId: string,
  senderWs: WebSocket,
  message: object,
) {
  const room = rooms.get(gameId);
  if (!room) return;
  const payload = JSON.stringify(message);
  for (const client of room) {
    if (client !== senderWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function getSpectatorCount(gameId: string): number {
  const room = rooms.get(gameId);
  if (!room) return 0;
  let count = 0;
  for (const client of room) {
    if (clientData.get(client)?.playerColor === null) {
      count++;
    }
  }
  return count;
}

function broadcastAll(gameId: string, message: object) {
  const room = rooms.get(gameId);
  if (!room) return;
  const payload = JSON.stringify(message);
  for (const client of room) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req: IncomingMessage, socket, head) => {
    if (req.url?.startsWith("/ws")) {
      const origin = req.headers.origin;
      const corsHeaders = getCorsHeaders(origin);

      if (!validateWebSocketOrigin(req)) {
        socket.write(
          `HTTP/1.1 403 Forbidden\r\n` +
            `${corsHeaders}` +
            `Content-Type: text/plain\r\n` +
            `Connection: close\r\n\r\n` +
            `Origin not allowed`,
        );
        socket.destroy();
        return;
      }

      const clientIP = getClientIP(req, socket as Socket);

      const rateLimitResult = await checkRateLimit(
        clientIP,
        "ws-connect",
        WS_CONNECTION_RATE_LIMIT,
      );

      if (!rateLimitResult.allowed) {
        const retryAfter = rateLimitResult.retryAfterSeconds ?? 60;
        socket.write(
          `HTTP/1.1 429 Too Many Requests\r\n` +
            `${corsHeaders}` +
            `Retry-After: ${retryAfter}\r\n` +
            `Content-Type: text/plain\r\n` +
            `Connection: close\r\n\r\n` +
            `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        );
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
  });

  const heartbeatInterval = setInterval(() => {
    for (const client of wss.clients) {
      const data = clientData.get(client);
      if (data && !data.isAlive) {
        client.terminate();
        continue;
      }
      if (data) data.isAlive = false;
      client.ping();
    }
  }, 30_000);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  wss.on("connection", (ws, req: IncomingMessage) => {
    const cookies = parseCookies(req.headers.cookie);
    clientData.set(ws, {
      gameId: null,
      token: null,
      playerColor: null,
      cookies,
      isAlive: true,
    });

    ws.on("pong", () => {
      const data = clientData.get(ws);
      if (data) data.isAlive = true;
    });

    ws.on("message", async (raw) => {
      const rawString = raw.toString();

      const sizeError = checkMessageSize(rawString);
      if (sizeError) {
        ws.send(JSON.stringify({ type: "error", message: sizeError }));
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawString);
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      const result = validateMessage(parsed);
      if (!result.valid) {
        ws.send(JSON.stringify({ type: "error", message: result.error }));
        return;
      }

      const msg = result.message;
      const data = clientData.get(ws)!;

      switch (msg.type) {
        case "join":
          await handleJoin(ws, data, msg.gameId);
          break;

        case "move":
          if (data.gameId) {
            await handleMove(ws, data, msg.from, msg.to, msg.promotion);
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Not joined to a game",
              }),
            );
          }
          break;

        case "resign":
          if (data.gameId) {
            await handleResign(ws, data);
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Not joined to a game",
              }),
            );
          }
          break;

        case "draw_offer":
          if (data.gameId) {
            await handleDrawOffer(ws, data);
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Not joined to a game",
              }),
            );
          }
          break;

        case "draw_accept":
          if (data.gameId) {
            await handleDrawAccept(ws, data);
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Not joined to a game",
              }),
            );
          }
          break;

        case "draw_decline":
          if (data.gameId) {
            await handleDrawDecline(ws, data);
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Not joined to a game",
              }),
            );
          }
          break;

        case "draw_cancel":
          if (data.gameId) {
            await handleDrawCancel(ws, data);
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Not joined to a game",
              }),
            );
          }
          break;

        case "rematch_offer":
          if (data.gameId) {
            await handleRematchOffer(ws, data);
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Not joined to a game",
              }),
            );
          }
          break;

        case "rematch_accept":
          if (data.gameId) {
            await handleRematchAccept(ws, data);
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Not joined to a game",
              }),
            );
          }
          break;

        case "rematch_cancel":
          if (data.gameId) {
            await handleRematchCancel(ws, data);
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Not joined to a game",
              }),
            );
          }
          break;

        case "flag":
          if (data.gameId) {
            await handleFlag(ws, data);
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Not joined to a game",
              }),
            );
          }
          break;

        case "claim_win":
          if (data.gameId) {
            await handleClaimWin(ws, data);
          } else {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Not joined to a game",
              }),
            );
          }
          break;
      }
    });

    ws.on("close", async () => {
      const data = clientData.get(ws);
      if (!data?.gameId) return;

      const { gameId, playerColor } = data;
      const room = rooms.get(gameId);

      if (room) {
        room.delete(ws);
        if (room.size === 0) {
          rooms.delete(gameId);
        }
      }

      if (!playerColor) {
        await session.decrementSpectators(gameId);
      }

      if (room && room.size > 0) {
        const updatedCount = getSpectatorCount(gameId);
        broadcastAll(gameId, {
          type: "spectator_count",
          count: updatedCount,
        });
      }

      if (playerColor) {
        const game = await session.getGame(gameId);

        if (game?.status === "WAITING" && playerColor === "white") {
          const remainingClients = room?.size ?? 0;
          if (remainingClients === 0) {
            await session.deleteGame(gameId);
            return;
          }
        }

        if (game?.status === "IN_PROGRESS") {
          await session.setPlayerConnected(gameId, playerColor, false);

          if (game.timeInitialMs > 0) {
            const claimDeadline = await session.setClaimWinTimer(
              gameId,
              playerColor,
            );
            broadcastAll(gameId, {
              type: "opponent_disconnected",
              color: playerColor,
              claimDeadline,
            });
          } else {
            broadcastAll(gameId, {
              type: "opponent_disconnected",
              color: playerColor,
            });
            await session.setAbandonmentTimer(gameId, playerColor);
          }
        }

        if (
          game?.status === "FINISHED" ||
          game?.status === "ABANDONED"
        ) {
          await session.setPlayerConnected(gameId, playerColor, false);
          const remainingClients = room?.size ?? 0;
          if (remainingClients === 0) {
            await session.archiveAndDeleteGame(gameId);
          }
        }
      }
    });
  });

  gameEvents.on("game_updated", async (gameId: string, status: string) => {
    const room = rooms.get(gameId);
    if (room) {
      const game = await session.getGame(gameId);
      if (game) {
        for (const client of room) {
          const data = clientData.get(client);
          if (data?.token) {
            if (data.token === game.whiteToken) {
              data.playerColor = "white";
            } else if (data.token === game.blackToken) {
              data.playerColor = "black";
            }
          }
        }
      }
    }
    broadcastAll(gameId, { type: "game_update", status });
  });

  return wss;
}

async function handleJoin(ws: WebSocket, data: ClientData, gameId: string) {
  data.gameId = gameId;
  data.token = data.cookies.get(`chess_token_${gameId}`) ?? null;

  if (!rooms.has(gameId)) {
    rooms.set(gameId, new Set());
  }
  rooms.get(gameId)!.add(ws);

  const game = await session.getGame(gameId);
  if (!game) {
    ws.send(JSON.stringify({ type: "error", message: "Game not found" }));
    return;
  }

  if (data.token) {
    if (data.token === game.whiteToken) {
      data.playerColor = "white";
    } else if (data.token === game.blackToken) {
      data.playerColor = "black";
    }
  }

  if (!data.playerColor) {
    await session.incrementSpectators(gameId);
  }

  if (data.playerColor) {
    const abandonmentCheck =
      await session.checkAndProcessAbandonment(gameId);
    if (abandonmentCheck.abandoned) {
      const abandonedGame = await session.getGame(gameId);
      if (abandonedGame) {
        broadcastAll(gameId, {
          type: "game_abandoned",
          result: abandonmentCheck.result,
          status: "ABANDONED",
        });
      }
    }

    const abandonmentInfo = await session.getAbandonmentInfo(gameId);
    if (
      abandonmentInfo &&
      abandonmentInfo.disconnectedColor === data.playerColor
    ) {
      await session.clearAbandonmentTimer(gameId);
    }

    const connections = await session.getConnectionStatus(gameId);
    const wasConnected = connections[data.playerColor];
    await session.setPlayerConnected(gameId, data.playerColor, true);

    if (!wasConnected) {
      broadcastToOthers(gameId, ws, {
        type: "opponent_connected",
        color: data.playerColor,
      });
    }

    if (game.status !== "WAITING") {
      const updatedConnections = await session.getConnectionStatus(gameId);
      const opponentColor =
        data.playerColor === "white" ? "black" : "white";
      ws.send(
        JSON.stringify({
          type: "connection_status",
          opponentConnected: updatedConnections[opponentColor],
        }),
      );
    }
  }

  const { moves, corruptedIndices } =
    await session.getMovesWithRecovery(gameId);
  const pendingDrawOffer = await session.getDrawOffer(gameId);
  const pendingRematchOffer = await session.getRematchOffer(gameId);

  let gameStateCorrupted = corruptedIndices.length > 0;
  let validMoves = moves;
  let actualFen = game.currentFen;

  if (corruptedIndices.length > 0) {
    const replayResult = session.replayMoves(moves);
    if (replayResult.corruptedMoves.length > 0) {
      validMoves = replayResult.validMoves;
      actualFen = replayResult.lastValidFen;
      logger.ws.error("Game has corrupted move notation", {
        gameId,
        recoveredMoves: validMoves.length,
        totalMoves: moves.length,
      });
    }
  } else if (moves.length > 0) {
    const lastMove = moves[moves.length - 1];
    if (lastMove.fen !== game.currentFen) {
      const replayResult = session.replayMoves(moves);
      if (replayResult.corruptedMoves.length > 0) {
        gameStateCorrupted = true;
        validMoves = replayResult.validMoves;
        actualFen = replayResult.lastValidFen;
        logger.ws.error("Game has corrupted move notation", {
          gameId,
          recoveredMoves: validMoves.length,
          totalMoves: moves.length,
        });
      } else {
        actualFen = replayResult.lastValidFen;
        logger.ws.warn("Game had FEN mismatch, corrected from cached", {
          gameId,
        });
      }
    }
  }

  let opponentConnected: boolean | null = null;
  let claimDeadline: number | undefined;
  if (data.playerColor && game.status !== "WAITING") {
    const connections = await session.getConnectionStatus(gameId);
    const opponentColor =
      data.playerColor === "white" ? "black" : "white";
    opponentConnected = connections[opponentColor];

    if (!opponentConnected && game.timeInitialMs > 0) {
      const abandonmentInfo = await session.getAbandonmentInfo(gameId);
      if (
        abandonmentInfo &&
        abandonmentInfo.disconnectedColor === opponentColor
      ) {
        claimDeadline = abandonmentInfo.deadline;
      }
    }
  }

  const spectatorCount = getSpectatorCount(gameId);

  let clockData: Record<string, unknown> = {};
  if (game.timeInitialMs > 0) {
    const now = Date.now();
    let liveWhiteTimeMs = game.whiteTimeMs;
    let liveBlackTimeMs = game.blackTimeMs;

    if (game.status === "WAITING") {
      liveWhiteTimeMs = game.timeInitialMs;
      liveBlackTimeMs = game.timeInitialMs;
    }

    if (game.status === "IN_PROGRESS" && game.lastMoveAt > 0) {
      const turnFromFen = actualFen.split(" ")[1];
      const elapsed = now - game.lastMoveAt;
      if (turnFromFen === "w") {
        liveWhiteTimeMs = Math.max(0, game.whiteTimeMs - elapsed);
      } else {
        liveBlackTimeMs = Math.max(0, game.blackTimeMs - elapsed);
      }

      if (liveWhiteTimeMs <= 0 || liveBlackTimeMs <= 0) {
        const loser = liveWhiteTimeMs <= 0 ? "white" : "black";
        const result = loser === "white" ? "BLACK_WINS" : "WHITE_WINS";
        await session.setGameResult(gameId, result);
        await session.archiveGame(gameId);
        broadcastAll(gameId, {
          type: "flag",
          result,
          whiteTimeMs: Math.max(0, liveWhiteTimeMs),
          blackTimeMs: Math.max(0, liveBlackTimeMs),
        });
        return;
      }
    }

    clockData = {
      timeInitialMs: game.timeInitialMs,
      timeIncrementMs: game.timeIncrementMs,
      whiteTimeMs: liveWhiteTimeMs,
      blackTimeMs: liveBlackTimeMs,
      lastMoveAt: game.lastMoveAt,
    };
  }

  ws.send(
    JSON.stringify({
      type: "game_state",
      status: game.status,
      result: game.result,
      fen: actualFen,
      moves: validMoves.map((m) => ({
        moveNumber: m.moveNumber,
        notation: m.notation,
        createdAt: m.createdAt,
        fen: m.fen,
      })),
      pendingDrawOffer,
      pendingRematchOffer,
      opponentConnected,
      gameStateCorrupted,
      spectatorCount,
      ...(claimDeadline !== undefined ? { claimDeadline } : {}),
      ...clockData,
    }),
  );

  broadcastAll(gameId, { type: "spectator_count", count: spectatorCount });

  if (
    game.timeInitialMs > 0 &&
    game.status === "IN_PROGRESS" &&
    data.playerColor
  ) {
    const freshGame = await session.getGame(gameId);
    if (freshGame) {
      broadcastToOthers(gameId, ws, {
        type: "clock_sync",
        whiteTimeMs: freshGame.whiteTimeMs,
        blackTimeMs: freshGame.blackTimeMs,
        lastMoveAt: freshGame.lastMoveAt,
      });
    }
  }
}

async function handleMove(
  ws: WebSocket,
  data: ClientData,
  from: string,
  to: string,
  promotion?: string,
) {
  const gameId = data.gameId!;
  const token = data.token;

  const abandonmentCheck =
    await session.checkAndProcessAbandonment(gameId);
  if (abandonmentCheck.abandoned) {
    broadcastAll(gameId, {
      type: "game_abandoned",
      result: abandonmentCheck.result,
      status: "ABANDONED",
    });
    return;
  }

  const game = await session.getGame(gameId);
  if (!game) {
    ws.send(JSON.stringify({ type: "error", message: "Game not found" }));
    return;
  }

  if (game.status !== "IN_PROGRESS") {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Game is not in progress",
      }),
    );
    return;
  }

  let playerColor: "w" | "b" | null = null;
  if (token === game.whiteToken) playerColor = "w";
  else if (token === game.blackToken) playerColor = "b";

  if (!playerColor) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "You are not a player in this game",
      }),
    );
    return;
  }

  const chess = new Chess(game.currentFen);

  if (chess.turn() !== playerColor) {
    ws.send(JSON.stringify({ type: "error", message: "Not your turn" }));
    return;
  }

  let moveResult;
  try {
    moveResult = chess.move({
      from,
      to,
      promotion: promotion as "q" | "r" | "b" | "n" | undefined,
    });
  } catch {
    ws.send(JSON.stringify({ type: "error", message: "Invalid move" }));
    return;
  }

  if (!moveResult) {
    ws.send(JSON.stringify({ type: "error", message: "Invalid move" }));
    return;
  }

  const moveCount = await session.getMoveCount(gameId);
  const moveNumber = moveCount + 1;
  const newFen = chess.fen();
  const createdAt = Date.now();

  const isTimed = game.timeInitialMs > 0;
  let whiteTimeMs: number | undefined;
  let blackTimeMs: number | undefined;

  if (isTimed) {
    const moverColor = playerColor === "w" ? "white" : "black";
    const timeResult = await session.deductTimeAndMove(
      gameId,
      moverColor as "white" | "black",
      { moveNumber, notation: moveResult.san, fen: newFen, createdAt },
      createdAt,
    );

    if (timeResult.timedOut) {
      const result =
        timeResult.loser === "white" ? "BLACK_WINS" : "WHITE_WINS";
      await session.setGameResult(gameId, result);
      await session.archiveGame(gameId);
      broadcastAll(gameId, {
        type: "flag",
        result,
        whiteTimeMs: 0,
        blackTimeMs: 0,
      });
      return;
    }

    whiteTimeMs = timeResult.whiteTimeMs;
    blackTimeMs = timeResult.blackTimeMs;
  } else {
    await session.addMove(gameId, {
      moveNumber,
      notation: moveResult.san,
      fen: newFen,
      createdAt,
    });
  }

  let gameOver = false;
  let result: "WHITE_WINS" | "BLACK_WINS" | "DRAW" | null = null;

  if (chess.isCheckmate()) {
    gameOver = true;
    result = chess.turn() === "w" ? "BLACK_WINS" : "WHITE_WINS";
  } else if (chess.isDraw()) {
    gameOver = true;
    result = "DRAW";
  }

  if (gameOver && result) {
    await session.setGameResult(gameId, result);
    await session.archiveGame(gameId);
  }

  broadcastAll(gameId, {
    type: "move",
    from,
    to,
    san: moveResult.san,
    fen: newFen,
    moveNumber,
    createdAt,
    gameOver,
    result,
    ...(isTimed ? { whiteTimeMs, blackTimeMs } : {}),
  });

  if (!gameOver) {
    await session.clearDrawOffer(gameId);
  }
}

async function handleResign(ws: WebSocket, data: ClientData) {
  const gameId = data.gameId!;
  const token = data.token;

  const game = await session.getGame(gameId);
  if (!game) {
    ws.send(JSON.stringify({ type: "error", message: "Game not found" }));
    return;
  }

  if (game.status !== "IN_PROGRESS") {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Game is not in progress",
      }),
    );
    return;
  }

  let playerColor: "white" | "black" | null = null;
  if (token === game.whiteToken) playerColor = "white";
  else if (token === game.blackToken) playerColor = "black";

  if (!playerColor) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "You are not a player in this game",
      }),
    );
    return;
  }

  const result = playerColor === "white" ? "BLACK_WINS" : "WHITE_WINS";
  await session.setGameResult(gameId, result);
  await session.clearDrawOffer(gameId);
  await session.archiveGame(gameId);

  broadcastAll(gameId, { type: "resign", result });
}

async function handleDrawOffer(ws: WebSocket, data: ClientData) {
  const gameId = data.gameId!;
  const token = data.token;

  const game = await session.getGame(gameId);
  if (!game) {
    ws.send(JSON.stringify({ type: "error", message: "Game not found" }));
    return;
  }

  if (game.status !== "IN_PROGRESS") {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Game is not in progress",
      }),
    );
    return;
  }

  let playerColor: "white" | "black" | null = null;
  if (token === game.whiteToken) playerColor = "white";
  else if (token === game.blackToken) playerColor = "black";

  if (!playerColor) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "You are not a player in this game",
      }),
    );
    return;
  }

  const existingOffer = await session.getDrawOffer(gameId);
  if (existingOffer === playerColor) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "You already offered a draw",
      }),
    );
    return;
  }

  if (existingOffer && existingOffer !== playerColor) {
    await handleDrawAccept(ws, data);
    return;
  }

  await session.setDrawOffer(gameId, playerColor);
  broadcastAll(gameId, { type: "draw_offer", from: playerColor });
}

async function handleDrawAccept(ws: WebSocket, data: ClientData) {
  const gameId = data.gameId!;
  const token = data.token;

  const game = await session.getGame(gameId);
  if (!game) {
    ws.send(JSON.stringify({ type: "error", message: "Game not found" }));
    return;
  }

  if (game.status !== "IN_PROGRESS") {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Game is not in progress",
      }),
    );
    return;
  }

  let playerColor: "white" | "black" | null = null;
  if (token === game.whiteToken) playerColor = "white";
  else if (token === game.blackToken) playerColor = "black";

  if (!playerColor) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "You are not a player in this game",
      }),
    );
    return;
  }

  const pendingOffer = await session.getDrawOffer(gameId);
  if (!pendingOffer || pendingOffer === playerColor) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "No pending draw offer to accept",
      }),
    );
    return;
  }

  await session.setGameResult(gameId, "DRAW");
  await session.clearDrawOffer(gameId);
  await session.archiveGame(gameId);

  broadcastAll(gameId, { type: "draw_accepted", result: "DRAW" });
}

async function handleDrawDecline(ws: WebSocket, data: ClientData) {
  const gameId = data.gameId!;
  const token = data.token;

  const game = await session.getGame(gameId);
  if (!game) {
    ws.send(JSON.stringify({ type: "error", message: "Game not found" }));
    return;
  }

  if (game.status !== "IN_PROGRESS") {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Game is not in progress",
      }),
    );
    return;
  }

  let playerColor: "white" | "black" | null = null;
  if (token === game.whiteToken) playerColor = "white";
  else if (token === game.blackToken) playerColor = "black";

  if (!playerColor) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "You are not a player in this game",
      }),
    );
    return;
  }

  const pendingOffer = await session.getDrawOffer(gameId);
  if (!pendingOffer || pendingOffer === playerColor) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "No pending draw offer to decline",
      }),
    );
    return;
  }

  await session.clearDrawOffer(gameId);
  broadcastAll(gameId, { type: "draw_declined" });
}

async function handleDrawCancel(ws: WebSocket, data: ClientData) {
  const gameId = data.gameId!;
  const token = data.token;

  const game = await session.getGame(gameId);
  if (!game) {
    ws.send(JSON.stringify({ type: "error", message: "Game not found" }));
    return;
  }

  if (game.status !== "IN_PROGRESS") {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Game is not in progress",
      }),
    );
    return;
  }

  let playerColor: "white" | "black" | null = null;
  if (token === game.whiteToken) playerColor = "white";
  else if (token === game.blackToken) playerColor = "black";

  if (!playerColor) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "You are not a player in this game",
      }),
    );
    return;
  }

  const pendingOffer = await session.getDrawOffer(gameId);
  if (!pendingOffer || pendingOffer !== playerColor) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "You have no pending draw offer to cancel",
      }),
    );
    return;
  }

  await session.clearDrawOffer(gameId);
  broadcastAll(gameId, { type: "draw_cancelled", by: playerColor });
}

async function handleRematchOffer(ws: WebSocket, data: ClientData) {
  const gameId = data.gameId!;
  const token = data.token;

  const game = await session.getGame(gameId);
  if (!game) {
    ws.send(JSON.stringify({ type: "error", message: "Game not found" }));
    return;
  }

  if (game.status !== "FINISHED") {
    ws.send(
      JSON.stringify({ type: "error", message: "Game is not finished" }),
    );
    return;
  }

  let playerColor: "white" | "black" | null = null;
  if (token === game.whiteToken) playerColor = "white";
  else if (token === game.blackToken) playerColor = "black";

  if (!playerColor) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "You are not a player in this game",
      }),
    );
    return;
  }

  const existingOffer = await session.getRematchOffer(gameId);
  if (existingOffer === playerColor) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "You already offered a rematch",
      }),
    );
    return;
  }

  if (existingOffer && existingOffer !== playerColor) {
    await handleRematchAccept(ws, data);
    return;
  }

  await session.setRematchOffer(gameId, playerColor);
  broadcastAll(gameId, { type: "rematch_offer", from: playerColor });
}

async function handleRematchAccept(ws: WebSocket, data: ClientData) {
  const gameId = data.gameId!;
  const token = data.token;

  const game = await session.getGame(gameId);
  if (!game) {
    ws.send(JSON.stringify({ type: "error", message: "Game not found" }));
    return;
  }

  if (game.status !== "FINISHED") {
    ws.send(
      JSON.stringify({ type: "error", message: "Game is not finished" }),
    );
    return;
  }

  let playerColor: "white" | "black" | null = null;
  if (token === game.whiteToken) playerColor = "white";
  else if (token === game.blackToken) playerColor = "black";

  if (!playerColor) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "You are not a player in this game",
      }),
    );
    return;
  }

  const pendingOffer = await session.getRematchOffer(gameId);
  if (!pendingOffer || pendingOffer === playerColor) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "No pending rematch offer to accept",
      }),
    );
    return;
  }

  const {
    gameId: newGameId,
    newWhiteToken,
    newBlackToken,
  } = await session.createRematchGame(game.whiteToken, game.blackToken!, {
    timeInitialMs: game.timeInitialMs,
    timeIncrementMs: game.timeIncrementMs,
  });

  await session.clearRematchOffer(gameId);

  const room = rooms.get(gameId);
  if (room) {
    for (const client of room) {
      if (client.readyState !== WebSocket.OPEN) continue;
      const cd = clientData.get(client);
      const oldToken = cd?.token;

      let newToken: string | undefined;
      if (oldToken === game.whiteToken) {
        newToken = newBlackToken;
      } else if (oldToken === game.blackToken) {
        newToken = newWhiteToken;
      }

      client.send(
        JSON.stringify({
          type: "rematch_accepted",
          newGameId,
          ...(newToken ? { token: newToken } : {}),
        }),
      );
    }
  }

  await session.deleteGame(gameId);
}

async function handleRematchCancel(ws: WebSocket, data: ClientData) {
  const gameId = data.gameId!;
  const token = data.token;

  const game = await session.getGame(gameId);
  if (!game) {
    ws.send(JSON.stringify({ type: "error", message: "Game not found" }));
    return;
  }

  if (game.status !== "FINISHED") {
    ws.send(
      JSON.stringify({ type: "error", message: "Game is not finished" }),
    );
    return;
  }

  let playerColor: "white" | "black" | null = null;
  if (token === game.whiteToken) playerColor = "white";
  else if (token === game.blackToken) playerColor = "black";

  if (!playerColor) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "You are not a player in this game",
      }),
    );
    return;
  }

  const pendingOffer = await session.getRematchOffer(gameId);
  if (!pendingOffer || pendingOffer !== playerColor) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "You have no pending rematch offer to cancel",
      }),
    );
    return;
  }

  await session.clearRematchOffer(gameId);
  broadcastAll(gameId, { type: "rematch_cancelled", by: playerColor });
}

async function handleClaimWin(ws: WebSocket, data: ClientData) {
  const gameId = data.gameId!;
  const playerColor = data.playerColor;

  if (!playerColor) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "You are not a player in this game",
      }),
    );
    return;
  }

  const result = await session.claimWin(gameId, playerColor);

  if (!result.success) {
    ws.send(
      JSON.stringify({ type: "error", message: result.error }),
    );
    return;
  }

  broadcastAll(gameId, {
    type: "game_abandoned",
    result: result.result,
    status: "ABANDONED",
  });
}

async function handleFlag(ws: WebSocket, data: ClientData) {
  const gameId = data.gameId!;
  const token = data.token;

  const game = await session.getGame(gameId);
  if (!game) {
    ws.send(JSON.stringify({ type: "error", message: "Game not found" }));
    return;
  }

  if (game.status !== "IN_PROGRESS" || game.timeInitialMs === 0) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Not a timed game in progress",
      }),
    );
    return;
  }

  let playerColor: "white" | "black" | null = null;
  if (token === game.whiteToken) playerColor = "white";
  else if (token === game.blackToken) playerColor = "black";

  if (!playerColor) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "You are not a player in this game",
      }),
    );
    return;
  }

  const opponentColor = playerColor === "white" ? "black" : "white";
  const now = Date.now();
  const { timedOut } = await session.checkTimeout(
    gameId,
    opponentColor,
    now,
  );

  if (!timedOut) return;

  const result = opponentColor === "white" ? "BLACK_WINS" : "WHITE_WINS";
  await session.setGameResult(gameId, result);
  await session.archiveGame(gameId);

  broadcastAll(gameId, {
    type: "flag",
    result,
    whiteTimeMs: opponentColor === "white" ? 0 : game.whiteTimeMs,
    blackTimeMs: opponentColor === "black" ? 0 : game.blackTimeMs,
  });
}
