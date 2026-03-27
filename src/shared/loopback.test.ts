import { describe, expect, it } from "vitest";

import { isLoopbackEndpoint, normalizeEndpoint } from "./loopback";

describe("loopback endpoint validation", () => {
  it("accepts localhost and 127.0.0.1 over http", () => {
    expect(isLoopbackEndpoint("http://localhost:11434")).toBe(true);
    expect(isLoopbackEndpoint("http://127.0.0.1:11434")).toBe(true);
  });

  it("rejects non-loopback or non-http endpoints", () => {
    expect(isLoopbackEndpoint("https://localhost:11434")).toBe(false);
    expect(isLoopbackEndpoint("http://192.168.1.12:11434")).toBe(false);
    expect(isLoopbackEndpoint("http://example.com")).toBe(false);
  });

  it("normalizes the endpoint to an origin-only url", () => {
    expect(normalizeEndpoint("http://localhost:11434/api/tags?x=1")).toBe("http://localhost:11434");
  });
});
