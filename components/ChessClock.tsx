"use client";

import { formatClockTime } from "@/lib/chess-utils";

interface ChessClockProps {
  timeMs: number;
  isActive: boolean;
  isPlayerClock: boolean;
}

export function ChessClock({
  timeMs,
  isActive,
  isPlayerClock,
}: ChessClockProps) {
  const isExpired = timeMs <= 0;
  const isLow = timeMs > 0 && timeMs < 20000;

  return (
    <div
      className={`flex items-center justify-center rounded px-4 py-2 font-mono text-lg tabular-nums ${
        isExpired
          ? "bg-destructive/20 text-destructive"
          : isActive
            ? isLow
              ? "animate-pulse bg-destructive/20 text-destructive"
              : "gold-glow-sm bg-primary text-primary-foreground"
            : isPlayerClock
              ? "border border-border bg-card text-card-foreground"
              : "bg-secondary text-muted-foreground"
      }`}
    >
      {formatClockTime(timeMs)}
    </div>
  );
}
