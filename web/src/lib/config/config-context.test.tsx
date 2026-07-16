import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/server";
import { ConfigProvider, useConfig } from "./config-context";

function Probe() { const { config, base } = useConfig(); return <span>{config.name}:{base}</span>; }
function renderProvider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ConfigProvider><Probe /></ConfigProvider></QueryClientProvider>);
}

describe("runtime config", () => {
  it("fetches real config instead of pinning defaults", async () => {
    window.__FILESTASH_BOOT__ = { base: "/stash/" };
    server.use(http.get("*/stash/api/config", () => HttpResponse.json({ status: "ok", result: { name: "Acme" } })));
    renderProvider();
    expect(await screen.findByText("Acme:/stash/")).toBeInTheDocument();
  });

  it("shows an error and retries", async () => {
    let calls = 0;
    server.use(http.get("*/api/config", () => ++calls === 1 ? HttpResponse.json({ status: "error", message: "offline" }, { status: 503 }) : HttpResponse.json({ status: "ok", result: { name: "Recovered" } })));
    renderProvider();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Recovered:/")).toBeInTheDocument();
  });
});
