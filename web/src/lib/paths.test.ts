import { describe, expect, it } from "vitest";
import { normalizeBase, trimBase, withBase } from "./paths";

describe("runtime mount paths", () => {
  it("normalizes, prefixes, and trims a subpath without double slashes", () => {
    expect(normalizeBase("filestash")).toBe("/filestash/");
    expect(withBase("/api/config", "/filestash/")).toBe("/filestash/api/config");
    expect(trimBase("/filestash/files/docs/", "/filestash/")).toBe("/files/docs/");
  });

  it("keeps external URLs and root deployments unchanged", () => {
    expect(withBase("https://example.test/a", "/filestash/")).toBe("https://example.test/a");
    expect(withBase("/api/config", "/")).toBe("/api/config");
  });
});
