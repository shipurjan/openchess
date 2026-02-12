"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { CircleDashed, Clock, Swords, Trophy, XCircle } from "lucide-react";
import { formatTimeControl } from "@/lib/chess-utils";
import { Card } from "@/components/ui/card";

interface PublicGame {
  id: string;
  createdAt: number;
  status: string;
  players: number;
  spectators: number;
  timeInitialMs: number;
  timeIncrementMs: number;
}

const statusConfig: Record<
  string,
  { label: string; color: string; icon: typeof Clock; iconColor: string }
> = {
  WAITING: {
    label: "Waiting",
    color: "text-primary",
    icon: Clock,
    iconColor: "text-primary",
  },
  IN_PROGRESS: {
    label: "In progress",
    color: "text-green-400",
    icon: Swords,
    iconColor: "text-green-400",
  },
  FINISHED: {
    label: "Finished",
    color: "text-muted-foreground",
    icon: Trophy,
    iconColor: "text-muted-foreground",
  },
  ABANDONED: {
    label: "Abandoned",
    color: "text-destructive",
    icon: XCircle,
    iconColor: "text-destructive",
  },
};

export function LobbyList() {
  const [games, setGames] = useState<PublicGame[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGames = useCallback(async () => {
    try {
      const res = await fetch("/api/games/public");
      if (res.ok) {
        const data = await res.json();
        setGames(data.games);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGames();
    const interval = setInterval(fetchGames, 5000);
    return () => clearInterval(interval);
  }, [fetchGames]);

  if (loading) {
    return (
      <div className="text-center text-muted-foreground">Loading games...</div>
    );
  }

  if (games.length === 0) {
    return (
      <Card className="p-8 text-center">
        <CircleDashed className="mx-auto mb-4 h-10 w-10 text-muted-foreground/50" />
        <p className="mb-4 text-secondary-foreground">
          No public games available
        </p>
        <p className="text-sm text-muted-foreground">
          Create a public game to be the first!
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {games.map((game) => {
        const config = statusConfig[game.status];
        const StatusIcon = config?.icon ?? Clock;

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
                {game.players}/2 players
                <span className="ml-2 text-muted-foreground">
                  {formatTimeControl(game.timeInitialMs, game.timeIncrementMs)}
                </span>
              </p>
              {game.spectators > 0 && (
                <p className="text-xs text-muted-foreground">
                  {game.spectators}{" "}
                  {game.spectators === 1 ? "spectator" : "spectators"}
                </p>
              )}
            </div>
            <span
              className={`text-xs font-medium ${config?.color ?? "text-muted-foreground"}`}
            >
              {config?.label ?? game.status}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
