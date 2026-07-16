import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminScreen } from "./admin";

const adminApi = vi.hoisted(() => ({ session: vi.fn(), login: vi.fn(), getConfig: vi.fn(), saveConfig: vi.fn(), logs: vi.fn(), audit: vi.fn() }));
const configApi = vi.hoisted(() => ({ get: vi.fn() }));
const replace = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/endpoints", () => ({ adminApi, configApi }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

function renderAdmin(pathname = "/admin/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><AdminScreen pathname={pathname} /></QueryClientProvider>);
}

describe("admin workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminApi.login.mockResolvedValue(null);
    adminApi.saveConfig.mockResolvedValue(null);
    adminApi.logs.mockResolvedValue("");
    adminApi.audit.mockResolvedValue([]);
    configApi.get.mockResolvedValue({ connections: [{ label: "Local", type: "local" }] });
  });

  it("distinguishes session errors from logged-out state and retries", async () => {
    adminApi.session.mockRejectedValueOnce(new Error("session offline")).mockResolvedValueOnce(false);
    renderAdmin();
    expect(await screen.findByText("session offline")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("authenticates an administrator", async () => {
    adminApi.session.mockResolvedValue(false);
    const view = renderAdmin();
    await screen.findByRole("button", { name: "Sign in" });
    const password = view.container.querySelector('input[type="password"]') as HTMLInputElement;
    await userEvent.type(password, "correct horse");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(adminApi.login).toHaveBeenCalledWith("correct horse"));
  });

  it("saves typed values while retaining storage connections", async () => {
    adminApi.session.mockResolvedValue(true);
    adminApi.getConfig.mockResolvedValue({ general: {
      port: { label: "Port", type: "number", value: 8334 },
      name: { label: "Name", type: "text", value: "Files" },
      enabled: { label: "Enabled", type: "boolean", value: true },
    } });
    const view = renderAdmin();
    const port = await waitFor(() => {
      const element = view.container.querySelector('input[type="number"]');
      expect(element).not.toBeNull();
      return element as HTMLInputElement;
    });
    fireEvent.change(port, { target: { value: "9000", valueAsNumber: 9000 } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(adminApi.saveConfig).toHaveBeenCalledWith({
      general: { port: 9000, name: "Files", enabled: true },
      connections: [{ label: "Local", type: "local" }],
    }));
    expect(await screen.findByText("The current configuration was reloaded from the server.")).toBeInTheDocument();
  });

  it("uses the explicit setup token for first-run reads and writes", async () => {
    adminApi.session.mockResolvedValue(false);
    adminApi.getConfig.mockResolvedValue({ auth: { admin: { label: "admin", type: "bcrypt", value: "" } } });
    const view = renderAdmin("/admin/setup");
    const inputs = view.container.querySelectorAll('input[type="password"]');
    const token = "t".repeat(32);
    await userEvent.type(inputs[0], token);
    await userEvent.type(inputs[1], "new password");
    await userEvent.type(inputs[2], "new password");
    await userEvent.click(screen.getByRole("button", { name: "Create admin" }));
    await waitFor(() => expect(adminApi.getConfig).toHaveBeenCalledWith(undefined, token));
    expect(adminApi.saveConfig).toHaveBeenCalledWith(expect.objectContaining({ connections: [{ label: "Local", type: "local" }] }), token);
    expect(adminApi.login).toHaveBeenCalledWith("new password");
    expect(replace).toHaveBeenCalledWith("/admin/");
  });
});
