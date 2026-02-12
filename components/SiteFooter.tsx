import Link from "next/link";
import { Github } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="flex items-center justify-center gap-3 py-8 text-xs text-muted-foreground">
      <div className="flex items-center justify-center gap-2">
        <a
          href="https://github.com/shipurjan/openchess"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex gap-1 transition-colors hover:text-foreground"
          aria-label="GitHub"
        >
          <Github className="h-4 w-4" />
        </a>
        <a>Open source</a>
        <a>Self-hosted</a>
        <a>No accounts required</a>
        <Link href="/about" className="transition-colors hover:text-foreground">
          About
        </Link>
      </div>
    </footer>
  );
}
