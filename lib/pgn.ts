import { Chess } from "chess.js";

export type GameResult = "WHITE_WINS" | "BLACK_WINS" | "DRAW" | null;

export interface PgnInput {
  moves: { notation: string }[];
  result: GameResult;
  createdAt: Date;
}

export function gameResultToPgn(result: GameResult): string {
  switch (result) {
    case "WHITE_WINS":
      return "1-0";
    case "BLACK_WINS":
      return "0-1";
    case "DRAW":
      return "1/2-1/2";
    default:
      return "*";
  }
}

export function formatPgnDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

export function generatePgn(input: PgnInput): string {
  const chess = new Chess();

  for (const move of input.moves) {
    chess.move(move.notation);
  }

  const dateStr = formatPgnDate(input.createdAt);
  const result = gameResultToPgn(input.result);

  const headers = [
    `[Event "OpenChess Game"]`,
    `[Site "OpenChess"]`,
    `[Date "${dateStr}"]`,
    `[Round "-"]`,
    `[White "Anonymous"]`,
    `[Black "Anonymous"]`,
    `[Result "${result}"]`,
  ];

  const movesText =
    input.moves.length > 0
      ? chess.pgn({ maxWidth: 80 }).split("\n").pop() || ""
      : "";

  return headers.join("\n") + "\n\n" + (movesText ? movesText + " " : "") + result;
}
