import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectoryListing, FileEntry } from "@/lib/api/types";
import { FilesScreen } from "./files";

const api = vi.hoisted(() => ({
  ls: vi.fn(), mkdir: vi.fn(), rm: vi.fn(), mv: vi.fn(), upload: vi.fn(),
  catUrl: vi.fn((path: string) => `/api/files/cat?path=${path}`),
}));
const push = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/endpoints", () => ({ filesApi: api }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function listing(entries: FileEntry[], permissions: DirectoryListing["permissions"] = {}, nextCursor?: string): DirectoryListing {
  return { entries, permissions, nextCursor };
}

function renderFiles(pathname = "/files/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><FilesScreen pathname={pathname} /></QueryClientProvider>);
}

describe("file browser contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.mkdir.mockResolvedValue(null);
    api.rm.mockResolvedValue(null);
    api.mv.mockResolvedValue(null);
    api.upload.mockResolvedValue(null);
  });

  it("gates mutations by capabilities and bounds large directory rendering", async () => {
    api.ls.mockResolvedValue(listing(Array.from({ length: 300 }, (_, index) => ({ name: `file-${String(index).padStart(3, "0")}.txt`, type: "file" as const, time: 0, size: index })), {
      can_create_directory: false, can_upload: false, can_rename: false, can_delete: false,
    }));
    renderFiles();
    expect(await screen.findByText("file-000.txt")).toBeInTheDocument();
    expect(screen.queryByText("file-299.txt")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New folder/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Upload/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Rename file-000/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Delete file-000/i })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("file-299.txt")).toBeInTheDocument();
    await userEvent.click(screen.getByText("file-299.txt"));
    expect(push).toHaveBeenCalledWith("/view/file-299.txt");
  }, 20_000);

  it("loads every server cursor page without losing entries", async () => {
    const permissions = {
      can_create_directory: false, can_upload: false, can_rename: false, can_delete: false,
    };
    api.ls.mockImplementation(async (_path: string, cursor?: string) => {
      if (!cursor) return listing([{ name: "first.txt", type: "file", time: 0, size: 1 }], permissions, "bmV4dA");
      return listing([{ name: "later.txt", type: "file", time: 0, size: 2 }], {});
    });

    renderFiles("/files/docs/");

    expect(await screen.findByText("first.txt")).toBeInTheDocument();
    expect(await screen.findByText("later.txt")).toBeInTheDocument();
    expect(api.ls).toHaveBeenNthCalledWith(1, "/docs/", undefined, expect.any(AbortSignal));
    expect(api.ls).toHaveBeenNthCalledWith(2, "/docs/", "bmV4dA", expect.any(AbortSignal));
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("button", { name: /Upload/i })).toBeDisabled();
  });

  it("keeps failed mutations visible and retryable", async () => {
    api.ls.mockResolvedValue(listing([], { can_create_directory: true, can_upload: true }));
    api.mkdir.mockRejectedValue(new Error("storage unavailable"));
    renderFiles("/files/docs/");
    await screen.findByText("This folder is empty");
    await userEvent.click(screen.getByRole("button", { name: /New folder/i }));
    await userEvent.type(within(screen.getByRole("dialog")).getByRole("textbox"), "reports");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("storage unavailable", {}, { timeout: 4000 })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(api.mkdir).toHaveBeenCalledTimes(4), { timeout: 4000 });
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("storage unavailable")).not.toBeInTheDocument();
  }, 10_000);
});
