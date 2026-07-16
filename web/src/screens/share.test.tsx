import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { shareApi } from "@/lib/api/endpoints";
import { ShareScreen } from "./share";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/api/endpoints", () => ({ shareApi: { proof: vi.fn() } }));

describe("share route identity", () => {
  beforeEach(() => vi.mocked(shareApi.proof).mockResolvedValue({ key: "password", path: "/" }));

  it("starts a fresh proof flow when navigating between share IDs", async () => {
    const client = new QueryClient();
    const view = render(<QueryClientProvider client={client}><ShareScreen key="A" pathname="/s/A" /></QueryClientProvider>);
    await waitFor(() => expect(shareApi.proof).toHaveBeenCalledWith("A", null));
    view.rerender(<QueryClientProvider client={client}><ShareScreen key="B" pathname="/s/B" /></QueryClientProvider>);
    await waitFor(() => expect(shareApi.proof).toHaveBeenCalledWith("B", null));
  });
});
