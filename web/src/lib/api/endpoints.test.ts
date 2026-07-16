import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/server";
import { adminApi, filesApi } from "./endpoints";

describe("typed endpoint contracts", () => {
  it("sends the operator setup token only on explicit setup calls", async () => {
    let received = "";
    server.use(http.get("*/admin/api/config", ({ request }) => {
      received = request.headers.get("X-Filestash-Setup-Token") ?? "";
      return HttpResponse.json({ status: "ok", result: {} });
    }));
    await adminApi.getConfig(undefined, "x".repeat(32));
    expect(received).toBe("x".repeat(32));
  });

  it("returns directory permissions and consumes the opaque cursor contract", async () => {
    let requestUrl = "";
    server.use(http.get("*/api/files/ls", ({ request }) => {
      requestUrl = request.url;
      return HttpResponse.json(
        { status: "ok", results: [], permissions: { can_upload: false } },
        { headers: { "X-Next-Cursor": "bmV4dC1wYWdl" } },
      );
    }));
    await expect(filesApi.ls("/docs/", "cHJldmlvdXMtcGFnZQ==")).resolves.toEqual({
      entries: [],
      permissions: { can_upload: false },
      nextCursor: "bmV4dC1wYWdl",
    });
    const params = new URL(requestUrl).searchParams;
    expect(params.get("path")).toBe("/docs/");
    expect(params.get("cursor")).toBe("cHJldmlvdXMtcGFnZQ==");
    expect(params.get("limit")).toBe("250");
  });
});
