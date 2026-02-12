import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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

      <div className="space-y-2 text-sm text-muted-foreground">
        <p>
          <span className="text-secondary-foreground">Version:</span> {version}
        </p>
        <p>
          <span className="text-secondary-foreground">Commit:</span>{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {commit}
          </code>
        </p>
      </div>
    </div>
  );
}
