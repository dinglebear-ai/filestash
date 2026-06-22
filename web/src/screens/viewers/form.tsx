"use client";

// Form viewer (legacy application_form, application/x-form). Renders the form's
// JSON payload as a readable key/value list, falling back to formatted JSON.
import { useEffect, useState } from "react";

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

  if (error) return <p className="aurora-text-body text-[var(--aurora-error)]">{error}</p>;
  if (data === undefined) return <p className="aurora-text-meta">Loading…</p>;

  const entries =
    data && typeof data === "object" && !Array.isArray(data) ? Object.entries(data as Record<string, unknown>) : null;

  return (
    <div
      className="w-full max-w-xl rounded-[var(--aurora-radius-2)] p-5"
      style={{ background: "var(--aurora-panel-strong)", border: "1px solid var(--aurora-border-default)" }}
    >
      {entries ? (
        <dl className="flex flex-col gap-3">
          {entries.map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5">
              <dt className="aurora-text-label text-[var(--aurora-text-muted)]">{k}</dt>
              <dd className="aurora-text-body">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <pre className="aurora-text-code whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
      )}
    </div>
  );
}
