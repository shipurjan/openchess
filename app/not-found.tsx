import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="animate-fade-in flex flex-1 flex-col items-center justify-center px-6 py-24">
      <h1 className="font-display text-7xl font-bold tracking-tight text-foreground">
        404
      </h1>
      <p className="mt-3 text-lg text-muted-foreground">Page not found</p>
      <Button asChild className="mt-6">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
