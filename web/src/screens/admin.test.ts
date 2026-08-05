import { describe, expect, it } from "vitest";
import { serializeConfig } from "./admin";

describe("admin config serialization", () => {
  it("coerces number fields and preserves unrelated connections", () => {
    const result = serializeConfig({ general: { port: { label: "port", type: "number", value: "8334" }, name: { label: "name", type: "text", value: "Files" } }, connections: [{ label: "Local", type: "local" }] });
    expect(result).toEqual({ general: { port: 8334, name: "Files" }, connections: [{ label: "Local", type: "local" }] });
  });

  it("uses effective defaults for unset fields", () => {
    const result = serializeConfig({
      general: {
        port: { label: "port", type: "number", value: null, default: 45673 },
        force_ssl: { label: "force_ssl", type: "boolean", value: null, default: true },
        display_hidden: { label: "display_hidden", type: "boolean", value: null, default: false },
        name: { label: "name", type: "text", value: null, default: "Filestash" },
        host: { label: "host", type: "text", value: null, default: null },
      },
    });

    expect(result).toEqual({ general: { port: 45673, force_ssl: true, display_hidden: false, name: "Filestash" } });
  });

  it("rejects invalid numeric values before saving", () => {
    expect(() => serializeConfig({ port: { label: "Port", type: "number", value: "nope" } })).toThrow("Port must be a valid number");
  });

  it("omits number fields with no value and no default instead of inventing 0", () => {
    const result = serializeConfig({ general: { port: { label: "port", type: "number", value: null } } });
    expect(result).toEqual({ general: {} });
  });

  it("preserves a falsy-but-set boolean value over a truthy default", () => {
    const result = serializeConfig({ general: { force_ssl: { label: "force_ssl", type: "boolean", value: false, default: true } } });
    expect(result).toEqual({ general: { force_ssl: false } });
  });

  it("preserves a zero numeric value over a non-zero default", () => {
    const result = serializeConfig({ general: { retries: { label: "retries", type: "number", value: 0, default: 99 } } });
    expect(result).toEqual({ general: { retries: 0 } });
  });

  it("uses the default for an unset enable field", () => {
    const result = serializeConfig({ general: { feature: { label: "feature", type: "enable", value: null, default: true } } });
    expect(result).toEqual({ general: { feature: true } });
  });

  it("omits text/boolean fields with no value and no default", () => {
    const result = serializeConfig({
      general: {
        host: { label: "host", type: "text", value: null, default: null },
        force_ssl: { label: "force_ssl", type: "boolean", value: null, default: null },
      },
    });
    expect(result).toEqual({ general: {} });
  });
});
