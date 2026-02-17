export const MAX_MESSAGE_SIZE = 1024;
export const MAX_GAME_ID_LENGTH = 36;
export const MAX_TYPE_LENGTH = 20;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_MESSAGE_TYPES = [
  "join",
  "move",
  "resign",
  "draw_offer",
  "draw_accept",
  "draw_decline",
  "draw_cancel",
  "rematch_offer",
  "rematch_accept",
  "rematch_cancel",
  "flag",
  "claim_win",
] as const;

type MessageType = (typeof VALID_MESSAGE_TYPES)[number];

export interface JoinMessage {
  type: "join";
  gameId: string;
}

export interface MoveMessage {
  type: "move";
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
}

export interface SimpleMessage {
  type:
    | "resign"
    | "draw_offer"
    | "draw_accept"
    | "draw_decline"
    | "draw_cancel"
    | "rematch_offer"
    | "rematch_accept"
    | "rematch_cancel"
    | "flag"
    | "claim_win";
}

export type ValidatedMessage = JoinMessage | MoveMessage | SimpleMessage;

export type ValidationResult =
  | { valid: true; message: ValidatedMessage }
  | { valid: false; error: string };

export function isValidSquare(square: unknown): square is string {
  if (typeof square !== "string") return false;
  if (square.length !== 2) return false;
  const file = square[0];
  const rank = square[1];
  return file >= "a" && file <= "h" && rank >= "1" && rank <= "8";
}

export function isValidPromotion(
  promotion: unknown,
): promotion is "q" | "r" | "b" | "n" | undefined {
  if (promotion === undefined) return true;
  if (typeof promotion !== "string") return false;
  return ["q", "r", "b", "n"].includes(promotion);
}

export function isValidGameId(gameId: unknown): gameId is string {
  if (typeof gameId !== "string") return false;
  if (gameId.length === 0 || gameId.length > MAX_GAME_ID_LENGTH)
    return false;
  return UUID_REGEX.test(gameId);
}

export function checkMessageSize(rawMessage: string): string | null {
  if (rawMessage.length > MAX_MESSAGE_SIZE) {
    return `Message too large: ${rawMessage.length} bytes (max ${MAX_MESSAGE_SIZE})`;
  }
  return null;
}

export function validateMessage(data: unknown): ValidationResult {
  if (data === null || data === undefined) {
    return { valid: false, error: "Message is null or undefined" };
  }

  if (typeof data !== "object" || Array.isArray(data)) {
    return { valid: false, error: "Message must be an object" };
  }

  const msg = data as Record<string, unknown>;

  if (!("type" in msg) || typeof msg.type !== "string") {
    return {
      valid: false,
      error: "Message must have a string type field",
    };
  }

  const type = msg.type;

  if (type.length > MAX_TYPE_LENGTH) {
    return {
      valid: false,
      error: `Message type too long (max ${MAX_TYPE_LENGTH} characters)`,
    };
  }

  if (
    type === "__proto__" ||
    type === "constructor" ||
    type === "prototype"
  ) {
    return { valid: false, error: "Invalid message type" };
  }

  if (!VALID_MESSAGE_TYPES.includes(type as MessageType)) {
    return { valid: false, error: `Unknown message type: ${type}` };
  }

  switch (type) {
    case "join": {
      if (!isValidGameId(msg.gameId)) {
        return {
          valid: false,
          error: "join message requires valid gameId",
        };
      }
      return {
        valid: true,
        message: { type: "join", gameId: msg.gameId },
      };
    }

    case "move": {
      if (!isValidSquare(msg.from)) {
        return {
          valid: false,
          error: "move message requires valid from square",
        };
      }
      if (!isValidSquare(msg.to)) {
        return {
          valid: false,
          error: "move message requires valid to square",
        };
      }
      if (!isValidPromotion(msg.promotion)) {
        return {
          valid: false,
          error: "move message has invalid promotion",
        };
      }
      const moveMsg: MoveMessage = {
        type: "move",
        from: msg.from,
        to: msg.to,
      };
      if (msg.promotion !== undefined) {
        moveMsg.promotion = msg.promotion as "q" | "r" | "b" | "n";
      }
      return { valid: true, message: moveMsg };
    }

    case "resign":
    case "draw_offer":
    case "draw_accept":
    case "draw_decline":
    case "draw_cancel":
    case "rematch_offer":
    case "rematch_accept":
    case "rematch_cancel":
    case "flag":
    case "claim_win":
      return { valid: true, message: { type } as SimpleMessage };

    default:
      return {
        valid: false,
        error: `Unhandled message type: ${type}`,
      };
  }
}
