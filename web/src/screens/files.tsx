"use client";

// File browser — faithful port of the files page. Lists a directory via
// /api/files/ls, navigates folders, opens files in the viewer, and supports the
// core operations (new folder, upload, rename, delete) against the existing API.
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Folder,
  File as FileIcon,
  Upload,
  FolderPlus,
  Trash2,
  Pencil,
  Download,
  Search,
} from "lucide-react";
import { filesApi } from "@/lib/api/endpoints";
import type { FileEntry } from "@/lib/api/types";
import { Button } from "@/registry/aurora/ui/button";
import { Input } from "@/registry/aurora/ui/input";

/** Map the URL (/files/<path>) to the storage ls path ("/<path>/"). */
function storagePathFrom(pathname: string): string {
  let p = pathname.replace(/^\/files/, "");
  if (!p.startsWith("/")) p = `/${p}`;
  if (!p.endsWith("/")) p = `${p}/`;
  return p;
}

export function FilesScreen({ pathname }: { pathname: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const path = storagePathFrom(pathname);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  const ls = useQuery({
    queryKey: ["ls", path],
    queryFn: ({ signal }) => filesApi.ls(path, signal),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ls", path] });
  const mkdir = useMutation({ mutationFn: (name: string) => filesApi.mkdir(`${path}${name}/`), onSuccess: invalidate });
  const rm = useMutation({
    mutationFn: (entry: FileEntry) => filesApi.rm(`${path}${entry.name}${entry.type === "directory" ? "/" : ""}`),
    onSuccess: invalidate,
  });
  const mv = useMutation({
    mutationFn: ({ entry, to }: { entry: FileEntry; to: string }) => {
      const suffix = entry.type === "directory" ? "/" : "";
      return filesApi.mv(`${path}${entry.name}${suffix}`, `${path}${to}${suffix}`);
    },
    onSuccess: invalidate,
  });
  const upload = useMutation({
    mutationFn: (file: File) => filesApi.upload(`${path}${file.name}`, file),
    onSuccess: invalidate,
  });

  const entries = useMemo(() => {
    const list = (ls.data ?? []).filter((e) => e.name.toLowerCase().includes(query.toLowerCase()));
    // Folders first, then alphabetical.
    return [...list].sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [ls.data, query]);

  const segments = path.split("/").filter(Boolean);

  const openEntry = (e: FileEntry) => {
    if (e.type === "directory") router.push(`/files${path}${e.name}/`);
    else router.push(`/view${path}${e.name}`);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-6 py-6">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1 aurora-text-ui">
        <button className="text-[var(--aurora-accent-primary)]" onClick={() => router.push("/files/")}>
          home
        </button>
        {segments.map((seg, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="text-[var(--aurora-text-muted)]">/</span>
            <button
              className="text-[var(--aurora-accent-primary)]"
              onClick={() => router.push(`/files/${segments.slice(0, i + 1).join("/")}/`)}
            >
              {seg}
            </button>
          </span>
        ))}
      </nav>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="neutral"
          onClick={() => {
            const name = window.prompt("New folder name");
            if (name) mkdir.mutate(name);
          }}
        >
          <FolderPlus size={15} /> New folder
        </Button>
        <Button size="sm" variant="neutral" onClick={() => uploadRef.current?.click()}>
          <Upload size={15} /> Upload
        </Button>
        <input
          ref={uploadRef}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate(f);
            e.target.value = "";
          }}
        />
        <div className="ml-auto w-56">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter"
            startAdornment={<Search size={15} />}
          />
        </div>
      </div>

      {/* Listing */}
      <div
        className="overflow-hidden rounded-[8px]"
        style={{ background: "var(--aurora-panel-strong)", border: "1px solid var(--aurora-border-strong)" }}
      >
        {ls.isLoading ? (
          <Row muted>Loading…</Row>
        ) : ls.isError ? (
          <Row muted>{(ls.error as Error).message}</Row>
        ) : entries.length === 0 ? (
          <Row muted>Empty</Row>
        ) : (
          entries.map((e) => (
            <div
              key={e.name}
              className="group flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0 hover:bg-[var(--aurora-hover-bg)]"
              style={{ borderColor: "var(--aurora-border-default)" }}
            >
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openEntry(e)}>
                {e.type === "directory" ? (
                  <Folder size={17} className="shrink-0 text-[var(--aurora-accent-primary)]" />
                ) : (
                  <FileIcon size={17} className="shrink-0 text-[var(--aurora-text-muted)]" />
                )}
                <span className="truncate aurora-text-ui">{e.name}</span>
                {e.type !== "directory" ? (
                  <span className="ml-auto shrink-0 aurora-text-meta">{formatSize(e.size)}</span>
                ) : null}
              </button>
              <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
                {e.type !== "directory" ? (
                  <a
                    className="p-1 text-[var(--aurora-text-muted)] hover:text-[var(--aurora-text-primary)]"
                    href={filesApi.catUrl(`${path}${e.name}`)}
                    title="Download"
                  >
                    <Download size={15} />
                  </a>
                ) : null}
                <button
                  className="p-1 text-[var(--aurora-text-muted)] hover:text-[var(--aurora-text-primary)]"
                  title="Rename"
                  onClick={() => {
                    const to = window.prompt("Rename to", e.name);
                    if (to && to !== e.name) mv.mutate({ entry: e, to });
                  }}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="p-1 text-[var(--aurora-text-muted)] hover:text-[var(--aurora-error)]"
                  title="Delete"
                  onClick={() => {
                    if (window.confirm(`Delete ${e.name}?`)) rm.mutate(e);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}

function Row({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div className={`px-4 py-6 text-center aurora-text-body ${muted ? "text-[var(--aurora-text-muted)]" : ""}`}>
      {children}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
