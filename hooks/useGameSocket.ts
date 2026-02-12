import { useEffect, useRef, useCallback, useState } from "react";

export interface MoveMessage {
  type: "move";
  from: string;
  to: string;
  san: string;
  fen: string;
  moveNumber: number;
  createdAt: number;
  gameOver: boolean;
  result: "WHITE_WINS" | "BLACK_WINS" | "DRAW" | null;
  whiteTimeMs?: number;
  blackTimeMs?: number;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export interface GameUpdateMessage {
  type: "game_update";
  status: string;
}

export interface ResignMessage {
  type: "resign";
  result: "WHITE_WINS" | "BLACK_WINS";
}

export interface DrawOfferMessage {
  type: "draw_offer";
  from: "white" | "black";
}

export interface DrawDeclinedMessage {
  type: "draw_declined";
}

export interface DrawCancelledMessage {
  type: "draw_cancelled";
  by: "white" | "black";
}

export interface DrawAcceptedMessage {
  type: "draw_accepted";
  result: "DRAW";
}

export interface RematchOfferMessage {
  type: "rematch_offer";
  from: "white" | "black";
}

export interface RematchAcceptedMessage {
  type: "rematch_accepted";
  newGameId: string;
  token?: string;
}

export interface RematchCancelledMessage {
  type: "rematch_cancelled";
  by: "white" | "black";
}

export interface GameAbandonedMessage {
  type: "game_abandoned";
  result: "WHITE_WINS" | "BLACK_WINS";
  status: "ABANDONED";
}

export interface OpponentConnectedMessage {
  type: "opponent_connected";
  color: "white" | "black";
}

export interface OpponentDisconnectedMessage {
  type: "opponent_disconnected";
  color: "white" | "black";
}

export interface ConnectionStatusMessage {
  type: "connection_status";
  opponentConnected: boolean;
}

export interface SpectatorCountMessage {
  type: "spectator_count";
  count: number;
}

export interface GameStateMessage {
  type: "game_state";
  status: string;
  result: "WHITE_WINS" | "BLACK_WINS" | "DRAW" | null;
  fen: string;
  moves: {
    moveNumber: number;
    notation: string;
    createdAt?: number;
    fen?: string;
  }[];
  pendingDrawOffer: "white" | "black" | null;
  pendingRematchOffer: "white" | "black" | null;
  opponentConnected: boolean | null;
  spectatorCount: number;
  timeInitialMs?: number;
  timeIncrementMs?: number;
  whiteTimeMs?: number;
  blackTimeMs?: number;
  lastMoveAt?: number;
}

export interface FlagMessage {
  type: "flag";
  result: "WHITE_WINS" | "BLACK_WINS";
  whiteTimeMs: number;
  blackTimeMs: number;
}

export interface ClockSyncMessage {
  type: "clock_sync";
  whiteTimeMs: number;
  blackTimeMs: number;
  lastMoveAt: number;
}

export type GameSocketMessage =
  | MoveMessage
  | ErrorMessage
  | GameUpdateMessage
  | ResignMessage
  | DrawOfferMessage
  | DrawDeclinedMessage
  | DrawAcceptedMessage
  | DrawCancelledMessage
  | OpponentConnectedMessage
  | OpponentDisconnectedMessage
  | ConnectionStatusMessage
  | GameStateMessage
  | RematchOfferMessage
  | RematchAcceptedMessage
  | RematchCancelledMessage
  | GameAbandonedMessage
  | SpectatorCountMessage
  | FlagMessage
  | ClockSyncMessage;

export function useGameSocket(
  gameId: string,
  onMessage: (msg: GameSocketMessage) => void,
  options: { enabled?: boolean } = {},
) {
  const { enabled = true } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retriesRef = useRef(0);
  const onMessageRef = useRef(onMessage);
  const gameIdRef = useRef(gameId);
  const pendingMessagesRef = useRef<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const intentionalCloseRef = useRef(false);
  const connectRef = useRef<() => void>(() => {});

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    gameIdRef.current = gameId;
  }, [gameId]);

  useEffect(() => {
    if (!enabled) return;

    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      setIsConnecting(true);
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        retriesRef.current = 0;
        ws.send(JSON.stringify({ type: "join", gameId: gameIdRef.current }));
        for (const msg of pendingMessagesRef.current) {
          ws.send(msg);
        }
        pendingMessagesRef.current = [];
      };

      ws.onmessage = (event) => {
        try {
          const msg: GameSocketMessage = JSON.parse(event.data);
          if (msg.type === "game_state") {
            setIsConnected(true);
            setIsConnecting(false);
          }
          onMessageRef.current(msg);
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        if (!intentionalCloseRef.current) {
          const delay = Math.min(1000 * 2 ** retriesRef.current, 10000);
          retriesRef.current++;
          reconnectTimer.current = setTimeout(
            () => connectRef.current(),
            delay,
          );
        }
        intentionalCloseRef.current = false;
      };
    };

    connectRef.current = connect;
    connect();

    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [enabled, gameId]);

  const sendOrQueue = useCallback((payload: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(payload);
    } else {
      pendingMessagesRef.current.push(payload);
    }
  }, []);

  const sendMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      sendOrQueue(JSON.stringify({ type: "move", from, to, promotion }));
    },
    [sendOrQueue],
  );

  const sendResign = useCallback(() => {
    sendOrQueue(JSON.stringify({ type: "resign" }));
  }, [sendOrQueue]);

  const sendDrawOffer = useCallback(() => {
    sendOrQueue(JSON.stringify({ type: "draw_offer" }));
  }, [sendOrQueue]);

  const sendDrawAccept = useCallback(() => {
    sendOrQueue(JSON.stringify({ type: "draw_accept" }));
  }, [sendOrQueue]);

  const sendDrawDecline = useCallback(() => {
    sendOrQueue(JSON.stringify({ type: "draw_decline" }));
  }, [sendOrQueue]);

  const sendDrawCancel = useCallback(() => {
    sendOrQueue(JSON.stringify({ type: "draw_cancel" }));
  }, [sendOrQueue]);

  const sendRematchOffer = useCallback(() => {
    sendOrQueue(JSON.stringify({ type: "rematch_offer" }));
  }, [sendOrQueue]);

  const sendRematchAccept = useCallback(() => {
    sendOrQueue(JSON.stringify({ type: "rematch_accept" }));
  }, [sendOrQueue]);

  const sendRematchCancel = useCallback(() => {
    sendOrQueue(JSON.stringify({ type: "rematch_cancel" }));
  }, [sendOrQueue]);

  const sendFlag = useCallback(() => {
    // Don't queue flags — they're time-sensitive
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "flag" }));
    }
  }, []);

  const reconnect = useCallback(() => {
    setIsConnected(false);
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current) {
      intentionalCloseRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }
    retriesRef.current = 0;
    reconnectTimer.current = setTimeout(() => connectRef.current(), 100);
  }, []);

  return {
    sendMove,
    sendResign,
    sendDrawOffer,
    sendDrawAccept,
    sendDrawDecline,
    sendDrawCancel,
    sendRematchOffer,
    sendRematchAccept,
    sendRematchCancel,
    sendFlag,
    isConnected,
    isConnecting,
    reconnect,
  };
}
