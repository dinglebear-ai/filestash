import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectScreen } from "./connect";

const backendApi = vi.hoisted(() => ({ list: vi.fn() }));
const sessionApi = vi.hoisted(() => ({ get: vi.fn(), login: vi.fn() }));
const replace = vi.hoisted(() => vi.fn());
const runtime = vi.hoisted(() => ({ config: { name: "Test Stash", connections: [{ label: "Local", type: "local", path: "/mnt" }] }, base: "/" }));

vi.mock("@/lib/api/endpoints", () => ({ backendApi, sessionApi }));
vi.mock("@/lib/config/config-context", () => ({ useConfig: () => runtime }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

function renderConnect() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><ConnectScreen /></QueryClientProvider>);
}

describe("storage connection flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionApi.get.mockResolvedValue({ is_authenticated: false, backendID: "" });
    sessionApi.login.mockResolvedValue({ is_authenticated: true, backendID: "local" });
    backendApi.list.mockResolvedValue({ local: {
      type: { label: "type", type: "hidden", value: "local" },
      path: { label: "Path", type: "text", value: "/" },
    } });
  });

  it("applies connection overrides and submits the backend form", async () => {
    renderConnect();
    const path = await screen.findByLabelText("Path");
    expect(path).toHaveValue("/mnt");
    await userEvent.clear(path);
    await userEvent.type(path, "/data");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(sessionApi.login).toHaveBeenCalledWith({ type: "local", Path: "/data" }));
    expect(replace).toHaveBeenCalledWith("/files/");
  });

  it("redirects an existing authenticated session", async () => {
    window.__FILESTASH_BOOT__ = { base: "/stash/" };
    sessionApi.get.mockResolvedValue({ is_authenticated: true, backendID: "local", next: "/stash/api/mcp?request_id=existing" });
    renderConnect();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/stash/api/mcp?request_id=existing"));
  });

  it("uses a login response continuation instead of the default file browser", async () => {
    sessionApi.login.mockResolvedValue({ is_authenticated: true, backendID: "local", next: "/api/mcp?request_id=login" });
    renderConnect();
    await screen.findByLabelText("Path");
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/api/mcp?request_id=login"));
  });

  it("rejects an unsafe session continuation", async () => {
    sessionApi.get.mockResolvedValue({ is_authenticated: true, backendID: "local", next: "https://example.test/steal" });
    renderConnect();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/files/"));
  });

  it("shows backend discovery failures", async () => {
    backendApi.list.mockRejectedValue(new Error("catalog offline"));
    renderConnect();
    expect(await screen.findByText("The backend catalog did not return a usable connection list.")).toBeInTheDocument();
  });
});
