export type PieceColor = "white" | "black";

export type GameResult = "WHITE_WINS" | "BLACK_WINS" | "DRAW" | null;

export interface MoveRecord {
  moveNumber: number;
  notation: string;
  createdAt?: number;
}

export interface MovePair {
  num: number;
  white: string;
  whiteTimestamp?: number;
  black?: string;
  blackTimestamp?: number;
}

export function getTurnFromFen(fen: string): PieceColor {
  const parts = fen.split(" ");
  return parts[1] === "b" ? "black" : "white";
}

export function getPieceColor(pieceType: string): PieceColor {
  return pieceType[0] === "w" ? "white" : "black";
}

export function formatResult(result: GameResult): string {
  switch (result) {
    case "WHITE_WINS":
      return "White wins";
    case "BLACK_WINS":
      return "Black wins";
    case "DRAW":
      return "Draw";
    default:
      return "";
  }
}

export function formatMoves(moves: MoveRecord[]): MovePair[] {
  const pairs: MovePair[] = [];
  for (const move of moves) {
    const pairIndex = Math.floor((move.moveNumber - 1) / 2);
    if (move.moveNumber % 2 === 1) {
      pairs.push({
        num: pairIndex + 1,
        white: move.notation,
        whiteTimestamp: move.createdAt,
      });
    } else if (pairs[pairIndex]) {
      pairs[pairIndex].black = move.notation;
      pairs[pairIndex].blackTimestamp = move.createdAt;
    }
  }
  return pairs;
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatClockTime(ms: number): string {
  if (ms <= 0) return "0:00";
  if (ms < 20000) {
    const totalTenths = Math.floor(ms / 100);
    const seconds = Math.floor(totalTenths / 10);
    const tenths = totalTenths % 10;
    return `${seconds}.${tenths}`;
  }
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatTimeControl(
  timeInitialMs: number,
  timeIncrementMs: number,
): string {
  if (timeInitialMs === 0) return "Unlimited";
  const minutes = Math.round(timeInitialMs / 60000);
  const incrementSeconds = Math.round(timeIncrementMs / 1000);
  if (incrementSeconds === 0) return `${minutes}+0`;
  return `${minutes}+${incrementSeconds}`;
}
