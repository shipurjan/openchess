"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatTimeControl } from "@/lib/chess-utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

export default function NewGamePage() {
  const router = useRouter();
  const [isPublic, setIsPublic] = useState(true);
  const [color, setColor] = useState<"white" | "black" | "random">("random");
  const [minutes, setMinutes] = useState(10);
  const [increment, setIncrement] = useState(0);
  const [unlimited, setUnlimited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeInitialMs = unlimited ? 0 : minutes * 60 * 1000;
  const timeIncrementMs = unlimited ? 0 : increment * 1000;

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPublic,
          timeInitialMs,
          timeIncrementMs,
          creatorColor: color,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create game");
        setLoading(false);
        return;
      }
      const { id } = await res.json();
      router.push(`/game/${id}`);
    } catch {
      setError("Failed to create game");
      setLoading(false);
    }
  }

  return (
    <div className="pt-12 pb-16">
      <div className="animate-fade-in mx-auto flex w-full max-w-lg flex-col gap-6 px-6">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            New Game
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose your time control and invite someone to play.
          </p>
        </div>

        {/* Time control */}
        <Card className="gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Time Control
            </h2>
            <span className="text-lg font-semibold text-foreground">
              {unlimited
                ? "Unlimited"
                : formatTimeControl(timeInitialMs, timeIncrementMs)}
            </span>
          </div>

          <label className="flex cursor-pointer items-center gap-3">
            <Switch checked={unlimited} onCheckedChange={setUnlimited} />
            <span className="text-sm text-secondary-foreground">
              Unlimited (no clock)
            </span>
          </label>

          {!unlimited && (
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs text-muted-foreground">
                  Minutes: {minutes}
                </label>
                <Slider
                  min={1}
                  max={60}
                  step={1}
                  value={[minutes]}
                  onValueChange={([v]) => setMinutes(v)}
                />
              </div>
              <div>
                <label className="mb-2 block text-xs text-muted-foreground">
                  Increment: {increment}s
                </label>
                <Slider
                  min={0}
                  max={30}
                  step={1}
                  value={[increment]}
                  onValueChange={([v]) => setIncrement(v)}
                />
              </div>
            </div>
          )}
        </Card>

        {/* Starting color */}
        <Card className="gap-4 p-5">
          <h2 className="text-sm font-medium text-muted-foreground">
            Play as
          </h2>
          <div className="flex gap-2">
            {(["white", "black", "random"] as const).map((c) => (
              <Button
                key={c}
                type="button"
                variant={color === c ? "default" : "outline"}
                size="sm"
                onClick={() => setColor(c)}
                className="flex-1 capitalize active:scale-[0.98]"
              >
                {c === "random" ? "Random" : c === "white" ? "White" : "Black"}
              </Button>
            ))}
          </div>
        </Card>

        {/* Visibility */}
        <div>
          <label className="flex cursor-pointer items-center gap-3">
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            <span className="text-sm text-secondary-foreground">
              Public game (visible in lobby)
            </span>
          </label>
          <p className="mt-1.5 pl-11 text-xs text-muted-foreground">
            Public games appear in the lobby on the home page.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          onClick={handleCreate}
          disabled={loading}
          size="lg"
          className="gold-glow-sm text-lg active:scale-[0.98]"
        >
          {loading ? "Creating..." : "Create Game"}
        </Button>
      </div>
    </div>
  );
}
