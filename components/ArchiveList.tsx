"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  CircleDashed,
  Trophy,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatTimeControl, formatResult } from "@/lib/chess-utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ArchiveGame {
  id: string;
  status: string;
  result: string | null;
  moveCount: number;
  timeInitialMs: number;
  timeIncrementMs: number;
  createdAt: string;
}

interface ArchiveResponse {
  games: ArchiveGame[];
  total: number;
  page: number;
  totalPages: number;
}

const statusConfig: Record<
  string,
  { icon: typeof Trophy; iconColor: string }
> = {
  FINISHED: { icon: Trophy, iconColor: "text-muted-foreground" },
  ABANDONED: { icon: XCircle, iconColor: "text-destructive" },
};

export function ArchiveList() {
  const [data, setData] = useState<ArchiveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const fetchGames = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/games/archive?page=${p}`);
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGames(page);
  }, [page, fetchGames]);

  if (loading) {
    return (
      <div className="text-center text-muted-foreground">Loading games...</div>
    );
  }

  if (!data || data.games.length === 0) {
    return (
      <Card className="p-8 text-center">
        <CircleDashed className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
        <p className="mb-4 text-secondary-foreground">
          No archived games yet
        </p>
        <p className="text-sm text-muted-foreground">
          Completed games will appear here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {data.games.map((game) => {
        const config = statusConfig[game.status];
        const StatusIcon = config?.icon ?? Trophy;
        const date = new Date(game.createdAt);

        return (
          <Link
            key={game.id}
            href={`/game/${game.id}`}
            className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5"
          >
            <StatusIcon
              className={`h-5 w-5 shrink-0 ${config?.iconColor ?? "text-muted-foreground"}`}
            />
            <div className="flex-1">
              <p className="text-sm text-secondary-foreground">
                {formatResult(
                  game.result as
                    | "WHITE_WINS"
                    | "BLACK_WINS"
                    | "DRAW"
                    | null,
                ) || "Abandoned"}
                <span className="ml-2 text-muted-foreground">
                  {game.moveCount}{" "}
                  {game.moveCount === 1 ? "move" : "moves"}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {formatTimeControl(game.timeInitialMs, game.timeIncrementMs)}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {date.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          </Link>
        );
      })}

      {data.totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= data.totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
