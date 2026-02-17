import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Link2, Swords, Archive } from "lucide-react";
import { LobbyList } from "@/components/LobbyList";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: { absolute: "OpenChess — Anonymous Real-Time Chess" },
};

const steps = [
  {
    icon: Plus,
    title: "Create",
    body: "Pick your time control and start a room.",
  },
  {
    icon: Link2,
    title: "Share",
    body: "Send the link to anyone. No sign-up needed.",
  },
  {
    icon: Swords,
    title: "Play",
    body: "Real-time chess with your friend — no accounts, no waiting.",
  },
];

export default function Home() {
  return (
    <div className="animate-fade-in mx-auto max-w-3xl px-6 pt-10 pb-12">
      {/* Hero */}
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="font-display text-5xl font-bold tracking-tight text-foreground">
          OpenChess
        </h1>
        <p className="text-lg text-muted-foreground">
          No accounts. No lobby. Just a link and a game.
        </p>
        <p className="text-sm text-muted-foreground/70">
          Self-hosted, anonymous real-time chess — create a room, send the link,
          play.
        </p>
        <Button
          asChild
          size="lg"
          className="animate-gold-pulse mt-2 h-auto px-8 py-3 text-lg"
        >
          <Link href="/new">New Game</Link>
        </Button>
      </div>

      {/* How It Works */}
      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {steps.map((step) => (
          <div key={step.title} className="text-center">
            <step.icon className="mx-auto mb-2 h-6 w-6 text-primary" />
            <h3 className="text-sm font-medium text-foreground">
              {step.title}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{step.body}</p>
          </div>
        ))}
      </div>

      {/* Separator */}
      <div className="my-10 flex items-center gap-4">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      </div>

      {/* Public Games */}
      <div>
        <h2 className="font-display mb-4 text-2xl font-bold tracking-tight text-foreground">
          Public Games
        </h2>
        <LobbyList />
      </div>

      {/* Archive Link */}
      <div className="mt-8 text-center">
        <Link
          href="/archive"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Archive className="h-4 w-4" />
          Browse completed games
        </Link>
      </div>
    </div>
  );
}
