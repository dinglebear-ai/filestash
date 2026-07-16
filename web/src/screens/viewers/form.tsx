"use client";

// Form viewer (legacy application_form, application/x-form). Renders the form's
// JSON payload as a readable key/value list, falling back to formatted JSON.
import { useEffect, useState } from "react";
import { CodeBlock } from "@/registry/aurora/blocks/workspace/code-block/code-block";
import { Callout } from "@/registry/aurora/ui/callout";
import { Card, CardContent } from "@/registry/aurora/ui/card";
import { DescriptionItem, DescriptionList } from "@/registry/aurora/ui/description-list";
import { SkeletonRow } from "@/registry/aurora/ui/skeleton";

export default function FormViewer({ src }: { src: string }) {
  const [data, setData] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(src, { credentials: "include" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`failed (${r.status})`))))
      .then((t) => {
        try {
          if (active) setData(JSON.parse(t));
        } catch {
          if (active) setData(t);
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [src]);

  if (error) {
    return (
      <Callout title="Could not load form data" variant="error">
        {error}
      </Callout>
    );
  }
  if (data === undefined) {
    return (
      <Card className="w-full max-w-xl">
        <CardContent className="grid gap-3 p-4">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </CardContent>
      </Card>
    );
  }

  const entries =
    data && typeof data === "object" && !Array.isArray(data) ? Object.entries(data as Record<string, unknown>) : null;

  return (
    <Card elevated className="w-full max-w-xl">
      <CardContent className="p-5">
      {entries ? (
        <DescriptionList>
          {entries.map(([k, v]) => (
            <DescriptionItem key={k} label={k} value={typeof v === "object" ? JSON.stringify(v) : String(v)} />
          ))}
        </DescriptionList>
      ) : (
        <CodeBlock language="json" code={JSON.stringify(data, null, 2)} />
      )}
      </CardContent>
    </Card>
  );
}
