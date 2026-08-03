"use client";

// File browser — faithful port of the files page. Lists a directory via
// /api/files/ls, navigates folders, opens files in the viewer, and supports the
// core operations (new folder, upload, rename, delete) against the existing API.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { withBase } from "@/lib/paths";
import { Button } from "@/registry/aurora/ui/button";
import { Badge } from "@/registry/aurora/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/registry/aurora/ui/breadcrumb";
import { Callout } from "@/registry/aurora/ui/callout";
import { Card, CardContent } from "@/registry/aurora/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/registry/aurora/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/registry/aurora/ui/dialog";
import { EmptyState } from "@/registry/aurora/ui/empty-state";
import { Field } from "@/registry/aurora/ui/field";
import { Input } from "@/registry/aurora/ui/input";
import { SkeletonRow } from "@/registry/aurora/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/registry/aurora/ui/table";
import { Toolbar, ToolbarGroup, ToolbarSeparator } from "@/registry/aurora/ui/toolbar";

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
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renameEntry, setRenameEntry] = useState<FileEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteEntry, setDeleteEntry] = useState<FileEntry | null>(null);
  const [page, setPage] = useState(0);

  const ls = useInfiniteQuery({
    queryKey: ["ls", path],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => filesApi.ls(path, pageParam, signal),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = ls;

  // Continue through the opaque server cursor chain. React Query guards each
  // request and keeps already-loaded pages visible while the next one arrives.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ls", path] });
  const mkdir = useMutation({ mutationFn: (name: string) => filesApi.mkdir(`${path}${name}/`), onSuccess: invalidate, retry: 1 });
  const rm = useMutation({
    mutationFn: (entry: FileEntry) => filesApi.rm(`${path}${entry.name}${entry.type === "directory" ? "/" : ""}`),
    onSuccess: invalidate, retry: 1,
  });
  const mv = useMutation({
    mutationFn: ({ entry, to }: { entry: FileEntry; to: string }) => {
      const suffix = entry.type === "directory" ? "/" : "";
      return filesApi.mv(`${path}${entry.name}${suffix}`, `${path}${to}${suffix}`);
    },
    onSuccess: invalidate, retry: 1,
  });
  const upload = useMutation({
    mutationFn: (file: File) => filesApi.upload(`${path}${file.name}`, file),
    onSuccess: invalidate, retry: 1,
  });

  const entries = useMemo(() => {
    const list = (ls.data?.pages.flatMap((directoryPage) => directoryPage.entries) ?? [])
      .filter((e) => e.name.toLowerCase().includes(query.toLowerCase()));
    // Folders first, then alphabetical.
    return [...list].sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [ls.data, query]);
  const pageSize = 250;
  const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleEntries = entries.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const permissions = ls.data?.pages[0]?.permissions ?? {};
  const allowed = (value: boolean | undefined) => value !== false;
  const mutation = [mkdir, rm, mv, upload].find((item) => item.isError);

  const retryMutation = () => {
    if (mkdir.isError && mkdir.variables) mkdir.mutate(mkdir.variables);
    else if (rm.isError && rm.variables) rm.mutate(rm.variables);
    else if (mv.isError && mv.variables) mv.mutate(mv.variables);
    else if (upload.isError && upload.variables) upload.mutate(upload.variables);
  };

  const segments = path.split("/").filter(Boolean);

  const openEntry = (e: FileEntry) => {
    if (e.type === "directory") router.push(withBase(`/files${path}${e.name}/`));
    else router.push(withBase(`/view${path}${e.name}`));
  };

  const createFolder = () => {
    const name = folderName.trim();
    if (!name) return;
    mkdir.mutate(name, {
      onSuccess: () => {
        setFolderName("");
        setFolderDialogOpen(false);
      },
    });
  };

  const renameSelected = () => {
    const to = renameValue.trim();
    if (!renameEntry || !to || to === renameEntry.name) return;
    mv.mutate(
      { entry: renameEntry, to },
      {
        onSuccess: () => {
          setRenameEntry(null);
          setRenameValue("");
        },
      },
    );
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      <header
        className="grid gap-3 rounded-[var(--aurora-radius-2)] border px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
        style={{
          background: "var(--aurora-panel-medium)",
          borderColor: "var(--aurora-border-default)",
          boxShadow: "var(--aurora-shadow-medium), var(--aurora-highlight-medium)",
        }}
      >
        <div className="min-w-0">
          <p className="aurora-text-eyebrow text-[var(--aurora-text-muted)]">File Navigator</p>
          <Breadcrumb className="mt-1">
            <BreadcrumbList>
          <BreadcrumbItem>
            {segments.length === 0 ? (
              <BreadcrumbPage>home</BreadcrumbPage>
            ) : (
              <BreadcrumbLink asChild>
                <Button size="unstyled" variant="plain" onClick={() => router.push(withBase("/files/"))}>Home</Button>
              </BreadcrumbLink>
            )}
          </BreadcrumbItem>
          {segments.map((seg, i) => {
            const href = `/files/${segments.slice(0, i + 1).join("/")}/`;
            const isCurrent = i === segments.length - 1;

            return (
              <Fragment key={`${seg}-${i}`}>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {isCurrent ? (
                    <BreadcrumbPage>{seg}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Button size="unstyled" variant="plain" onClick={() => router.push(withBase(href))}>{seg}</Button>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="info" shape="tag">{entries.length.toLocaleString()} {entries.length === 1 ? "Item" : "Items"}</Badge>
          <Badge tone="neutral" shape="tag">{segments.length === 0 ? "Storage Root" : "Folder"}</Badge>
        </div>
      </header>

      <Toolbar aria-label="File actions">
        <ToolbarGroup>
          <Button
            size="sm"
            variant="neutral"
            onClick={() => setFolderDialogOpen(true)}
            disabled={!allowed(permissions.can_create_directory)}
          >
            <FolderPlus size={15} /> New folder
          </Button>
          <Button size="sm" variant="neutral" onClick={() => uploadRef.current?.click()} disabled={!allowed(permissions.can_upload)}>
            <Upload size={15} /> Upload
          </Button>
        </ToolbarGroup>
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
        <ToolbarSeparator className="hidden sm:block" />
        <ToolbarGroup className="ml-auto w-full sm:w-64">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter files"
            aria-label="Filter files"
            startAdornment={<Search size={15} />}
          />
        </ToolbarGroup>
      </Toolbar>

      {mutation ? (
        <Callout title="File operation failed" variant="error">
          <div className="flex flex-wrap items-center gap-3"><span>{mutation.error instanceof Error ? mutation.error.message : "The storage backend rejected the operation."}</span><Button size="sm" variant="neutral" onClick={retryMutation}>Retry</Button><Button size="sm" variant="ghost" onClick={() => { mkdir.reset(); rm.reset(); mv.reset(); upload.reset(); }}>Dismiss</Button></div>
        </Callout>
      ) : null}

      {/* Listing */}
      <Card elevated className="overflow-hidden rounded-[8px]">
        <CardContent className="p-0">
        {ls.isPending ? (
          <div className="flex flex-col gap-3 p-4" aria-label="Loading directory">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : ls.isError ? (
          <div className="p-4">
            <Callout title="Could not load this folder" variant="error">
              {(ls.error as Error).message}
            </Callout>
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<FolderPlus size={22} />}
            title={query ? "No matching files" : "This folder is empty"}
            description={
              query
                ? "Clear the filter or search for a different file name."
                : "Upload a file or create a folder to start filling this space."
            }
            action={
              query ? (
                <Button size="sm" variant="neutral" onClick={() => setQuery("")}>
                  Clear filter
                </Button>
              ) : (
                <Button size="sm" variant="aurora" onClick={() => uploadRef.current?.click()}>
                  <Upload size={15} /> Upload
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-28">Size</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleEntries.map((entry) => (
                <TableRow key={entry.name} className="group">
                  <TableCell>
                    <Button
                      className="flex min-w-0 items-center gap-3 text-left"
                      size="unstyled"
                      variant="plain"
                      onClick={() => openEntry(entry)}
                    >
                      {entry.type === "directory" ? (
                        <Folder size={17} className="shrink-0 text-[var(--aurora-accent-primary)]" />
                      ) : (
                        <FileIcon size={17} className="shrink-0 text-[var(--aurora-text-muted)]" />
                      )}
                      <span className="truncate aurora-text-ui">{entry.name}</span>
                    </Button>
                  </TableCell>
                  <TableCell className="aurora-text-meta">
                    {entry.type === "directory" ? "Folder" : formatSize(entry.size)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      {entry.type !== "directory" ? (
                        <Button asChild size="icon" variant="ghost" title="Download">
                          <a href={filesApi.catUrl(`${path}${entry.name}`)} aria-label={`Download ${entry.name}`}>
                            <Download size={15} />
                          </a>
                        </Button>
                      ) : null}
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Rename"
                        aria-label={`Rename ${entry.name}`}
                        disabled={!allowed(permissions.can_rename)}
                        onClick={() => {
                          setRenameEntry(entry);
                          setRenameValue(entry.name);
                        }}
                      >
                        <Pencil size={15} />
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        title="Delete"
                        aria-label={`Delete ${entry.name}`}
                        disabled={!allowed(permissions.can_delete)}
                        onClick={() => setDeleteEntry(entry)}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        </CardContent>
      </Card>
      {ls.isFetchingNextPage ? (
        <p className="aurora-text-meta" role="status">Loading more files...</p>
      ) : null}
      {entries.length > pageSize ? (
        <div className="flex flex-wrap items-center justify-between gap-3 aurora-text-meta" aria-label="Directory pagination">
          <span className="aurora-text-meta">{entries.length.toLocaleString()} items</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="neutral" disabled={currentPage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button>
            <span>Page {currentPage + 1} of {pageCount}</span>
            <Button size="sm" variant="neutral" disabled={currentPage >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next</Button>
          </div>
        </div>
      ) : null}

      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>Create a folder in {path}</DialogDescription>
          </DialogHeader>
          <Field label="Folder name" htmlFor="new-folder-name">
            <Input id="new-folder-name" value={folderName} onChange={(event) => setFolderName(event.target.value)} autoFocus />
          </Field>
          <DialogFooter>
            <Button variant="neutral" onClick={() => setFolderDialogOpen(false)}>Cancel</Button>
            <Button variant="aurora" loading={mkdir.isPending} disabled={!folderName.trim()} onClick={createFolder}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(renameEntry)} onOpenChange={(open) => !open && setRenameEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>Update the selected item name.</DialogDescription>
          </DialogHeader>
          <Field label="Name" htmlFor="rename-item-name">
            <Input id="rename-item-name" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} autoFocus />
          </Field>
          <DialogFooter>
            <Button variant="neutral" onClick={() => setRenameEntry(null)}>Cancel</Button>
            <Button variant="aurora" loading={mv.isPending} disabled={!renameValue.trim()} onClick={renameSelected}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteEntry)} onOpenChange={(open) => !open && setDeleteEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteEntry?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This removes the item from the current storage backend.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="neutral" onClick={() => setDeleteEntry(null)}>Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                loading={rm.isPending}
                onClick={() => {
                  if (!deleteEntry) return;
                  rm.mutate(deleteEntry, { onSuccess: () => setDeleteEntry(null) });
                }}
              >
                Delete
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
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
