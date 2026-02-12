import Link from "next/link";
import { Crown } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="border-b border-border/50">
      <div className="mx-auto flex h-14 max-w-6xl items-center px-6">
        <Link
          href="/"
          className="flex items-center gap-2 transition-colors hover:text-primary"
        >
          <Crown className="h-5 w-5 text-primary" />
          <span className="font-display text-lg font-semibold">OpenChess</span>
        </Link>
      </div>
    </header>
  );
}
