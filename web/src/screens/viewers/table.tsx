"use client";

// CSV/TSV table viewer (legacy application_table). Parses with papaparse and
// renders an Aurora-styled table.
import { useEffect, useState } from "react";
import Papa from "papaparse";
import { Callout } from "@/registry/aurora/ui/callout";
import { Card, CardContent } from "@/registry/aurora/ui/card";
import { SkeletonRow } from "@/registry/aurora/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/registry/aurora/ui/table";
import { Button } from "@/registry/aurora/ui/button";

export default function TableViewer({ src }: { src: string }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let active = true;
    const collected: string[][] = [];
    Papa.parse<string[]>(src, {
      download: true,
      worker: true,
      withCredentials: true,
      skipEmptyLines: true,
      preview: 5001,
      step: ({ data }) => { if (active) collected.push(data as string[]); },
      complete: () => { if (active) setRows(collected); },
      error: (cause) => { if (active) setError(cause.message); },
    });
    return () => {
      active = false;
    };
  }, [src]);

  if (error) {
    return (
      <Callout title="Could not load table" variant="error">
        {error}
      </Callout>
    );
  }
  if (!rows) {
    return (
      <Card className="w-full">
        <CardContent className="grid gap-3 p-4">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </CardContent>
      </Card>
    );
  }

  const [header, ...body] = rows;
  const pageSize = 200;
  const pageCount = Math.max(1, Math.ceil(body.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = body.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return (
    <Card elevated className="flex h-full w-full flex-col overflow-hidden rounded-[8px]">
      <CardContent className="p-0">
      <Table>
        {header ? (
          <TableHeader>
            <TableRow>
              {header.map((cell, i) => (
                <TableHead
                  key={i}
                  className="sticky top-0 px-3 py-2 text-left aurora-text-label"
                  style={{ background: "var(--aurora-panel-medium)", borderBottom: "1px solid var(--aurora-border-strong)" }}
                >
                  {cell}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
        ) : null}
        <TableBody>
          {visibleRows.map((row, r) => (
            <TableRow key={r}>
              {row.map((cell, c) => (
                <TableCell key={c}>
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </CardContent>
      {pageCount > 1 ? <div className="flex items-center justify-between border-t border-[var(--aurora-border-default)] p-2 aurora-text-meta"><span>Showing up to 5,000 rows</span><div className="flex items-center gap-2"><Button size="sm" variant="neutral" disabled={currentPage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button><span>{currentPage + 1} / {pageCount}</span><Button size="sm" variant="neutral" disabled={currentPage === pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next</Button></div></div> : null}
    </Card>
  );
}
