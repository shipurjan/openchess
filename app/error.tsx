"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="animate-fade-in flex flex-1 flex-col items-center justify-center px-6 py-24">
      <AlertTriangle className="h-12 w-12 text-destructive" />
      <h1 className="font-display mt-4 text-3xl font-bold tracking-tight text-foreground">
        Something went wrong
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        An unexpected error occurred.
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
