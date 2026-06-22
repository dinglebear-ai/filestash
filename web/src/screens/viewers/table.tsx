"use client";

// CSV/TSV table viewer (legacy application_table). Parses with papaparse and
// renders an Aurora-styled table.
import { useEffect, useState } from "react";
import Papa from "papaparse";

export default function TableViewer({ src }: { src: string }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(src, { credentials: "include" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`failed (${r.status})`))))
      .then((text) => {
        const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
        if (active) setRows(parsed.data as string[][]);
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [src]);

  if (error) return <p className="aurora-text-body text-[var(--aurora-error)]">{error}</p>;
  if (!rows) return <p className="aurora-text-meta">Loading…</p>;

  const [header, ...body] = rows;
  return (
    <div
      className="h-full w-full overflow-auto rounded-[8px]"
      style={{ background: "var(--aurora-panel-strong)", border: "1px solid var(--aurora-border-default)" }}
    >
      <table className="w-full border-collapse aurora-text-table">
        {header ? (
          <thead>
            <tr>
              {header.map((cell, i) => (
                <th
                  key={i}
                  className="sticky top-0 px-3 py-2 text-left aurora-text-label"
                  style={{ background: "var(--aurora-panel-medium)", borderBottom: "1px solid var(--aurora-border-strong)" }}
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {body.map((row, r) => (
            <tr key={r} className="hover:bg-[var(--aurora-hover-bg)]">
              {row.map((cell, c) => (
                <td key={c} className="px-3 py-1.5" style={{ borderBottom: "1px solid var(--aurora-border-default)" }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
