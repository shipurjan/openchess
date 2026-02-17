import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Github } from "lucide-react";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  const version = process.env.NEXT_PUBLIC_BUILD_VERSION ?? "unknown";
  const commit = process.env.NEXT_PUBLIC_GIT_COMMIT ?? "unknown";

  return (
    <div className="animate-fade-in mx-auto max-w-3xl px-6 pt-10 pb-12">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <h1 className="font-display mb-6 text-3xl font-bold tracking-tight text-foreground">
        About
      </h1>

      <p className="text-sm text-muted-foreground">
        OpenChess is a self-hosted, anonymous real-time chess platform. Create a
        room, share the link, and play — no accounts required.
      </p>

      <h2 className="mt-8 text-sm font-medium text-foreground">Features</h2>
      <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
        <li>Real-time gameplay over WebSocket</li>
        <li>Configurable time controls with increment</li>
        <li>Spectator mode with live view</li>
        <li>Draw offers, resignation, and rematch</li>
        <li>Game archive with PGN export</li>
        <li>Public lobby for open games</li>
      </ul>

      <h2 className="mt-8 text-sm font-medium text-foreground">Tech Stack</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Next.js, TypeScript, Redis, PostgreSQL, chess.js, WebSocket.
      </p>

      <h2 className="mt-8 text-sm font-medium text-foreground">Links</h2>
      <div className="mt-2 flex flex-col gap-2 text-sm">
        <a
          href="https://github.com/shipurjan/openchess"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Github className="h-4 w-4" />
          GitHub
        </a>
        <a
          href="https://www.gnu.org/licenses/agpl-3.0.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          License: AGPL-3.0
        </a>
      </div>

      <div className="mt-8 border-t border-border pt-6">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="text-secondary-foreground">Version:</span>{" "}
            {version !== "unknown" ? (
              <a
                href={`https://github.com/shipurjan/openchess/releases/tag/v${version}`}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-foreground"
              >
                {version}
              </a>
            ) : (
              version
            )}
          </p>
          <p>
            <span className="text-secondary-foreground">Commit:</span>{" "}
            {commit !== "unknown" ? (
              <a
                href={`https://github.com/shipurjan/openchess/tree/${commit}`}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-foreground"
              >
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {commit}
                </code>
              </a>
            ) : (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {commit}
              </code>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
