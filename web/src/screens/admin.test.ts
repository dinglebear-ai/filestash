import { describe, expect, it } from "vitest";
import { serializeConfig } from "./admin";

describe("admin config serialization", () => {
  it("coerces number fields and preserves unrelated connections", () => {
    const result = serializeConfig({ general: { port: { label: "port", type: "number", value: "8334" }, name: { label: "name", type: "text", value: "Files" } }, connections: [{ label: "Local", type: "local" }] });
    expect(result).toEqual({ general: { port: 8334, name: "Files" }, connections: [{ label: "Local", type: "local" }] });
  });

  it("rejects invalid numeric values before saving", () => {
    expect(() => serializeConfig({ port: { label: "Port", type: "number", value: "nope" } })).toThrow("Port must be a valid number");
  });
});
