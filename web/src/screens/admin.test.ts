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

    expect(result).toEqual({ general: { port: 45673, force_ssl: true, display_hidden: false, name: "Filestash", host: "" } });
  });

  it("rejects invalid numeric values before saving", () => {
    expect(() => serializeConfig({ port: { label: "Port", type: "number", value: "nope" } })).toThrow("Port must be a valid number");
  });
});
