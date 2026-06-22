"use client";

// EPUB viewer (legacy application_ebook) via epub.js, with prev/next paging.
import { useEffect, useRef, useState } from "react";
import ePub, { type Rendition } from "epubjs";
import { Button } from "@/registry/aurora/ui/button";

export default function EbookViewer({ src }: { src: string }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    let destroyed = false;
    let book: ReturnType<typeof ePub> | null = null;
    try {
      book = ePub(src, { openAs: "epub" });
      const rendition = book.renderTo(area, { width: "100%", height: "100%", spread: "auto" });
      renditionRef.current = rendition;
      rendition.display().catch(() => !destroyed && setError("Couldn't render this ebook."));
    } catch {
      setError("Couldn't open this ebook.");
    }
    return () => {
      destroyed = true;
      renditionRef.current = null;
      book?.destroy();
    };
  }, [src]);

  return (
    <div className="flex h-full w-full flex-col gap-2">
      <div
        className="flex-1 overflow-hidden rounded-[8px]"
        style={{ background: "#fff", border: "1px solid var(--aurora-border-default)" }}
      >
        <div ref={areaRef} className="h-full w-full" />
      </div>
      {error ? (
        <p className="text-center aurora-text-body text-[var(--aurora-error)]">{error}</p>
      ) : (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="neutral" onClick={() => renditionRef.current?.prev()}>
            Previous
          </Button>
          <Button size="sm" variant="neutral" onClick={() => renditionRef.current?.next()}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
