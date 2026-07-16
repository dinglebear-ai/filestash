import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/server";
import { api, ApiRequestError, buildUrl } from "./client";

describe("API client", () => {
  it("preserves collection metadata and uses the runtime base", async () => {
    window.__FILESTASH_BOOT__ = { base: "/stash/" };
    server.use(http.get("*/stash/api/files/ls", () => HttpResponse.json({ status: "ok", results: [{ name: "a", type: "file", time: 0, size: 1 }], permissions: { can_delete: false } })));
    expect(buildUrl("/api/files/ls", { path: "/" })).toBe("/stash/api/files/ls?path=%2F");
    const envelope = await api.getEnvelope<unknown[]>("/api/files/ls", { query: { path: "/" } });
    expect(envelope.permissions).toEqual({ can_delete: false });
  });

  it("throws the server error message", async () => {
    server.use(http.get("*/api/config", () => HttpResponse.json({ status: "error", message: "Unavailable" }, { status: 503 })));
    await expect(api.get("/api/config")).rejects.toEqual(expect.objectContaining({ name: "ApiRequestError", message: "Unavailable", httpStatus: 503 } satisfies Partial<ApiRequestError>));
  });
});
