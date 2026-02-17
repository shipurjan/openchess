import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ArchiveList } from "@/components/ArchiveList";

export const metadata: Metadata = { title: "Archive" };

export default function ArchivePage() {
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
        Archive
      </h1>

      <ArchiveList />
    </div>
  );
}
