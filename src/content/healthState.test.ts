import { describe, expect, it } from "vitest";

import { areActionsAllowed, buildForbiddenGuidance, isForbiddenGenerationErrorMessage } from "./healthState";

describe("assistant health state helpers", () => {
  it("detects 403 generation messages", () => {
    expect(isForbiddenGenerationErrorMessage("Generation failed with status 403.")).toBe(true);
    expect(isForbiddenGenerationErrorMessage("Generation failed with status 500.")).toBe(false);
  });

  it("enables actions only when model is selected and health check is passing", () => {
    expect(areActionsAllowed(true, true, false)).toBe(true);
    expect(areActionsAllowed(false, true, false)).toBe(false);
    expect(areActionsAllowed(true, false, false)).toBe(false);
    expect(areActionsAllowed(true, true, true)).toBe(false);
  });

  it("builds guided recovery text with endpoint and model context", () => {
    const guidance = buildForbiddenGuidance(
      "http://localhost:11434",
      "llama3.2:3b",
      "Generation health check failed with status 403.",
      "forbidden by ollama origin policy",
    );

    expect(guidance).toContain("Endpoint: http://localhost:11434");
    expect(guidance).toContain("Model: llama3.2:3b");
    expect(guidance).toContain("Fix steps:");
    expect(guidance).toContain("status 403");
  });
});
