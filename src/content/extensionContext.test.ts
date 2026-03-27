import { describe, expect, it } from "vitest";

import {
  formatContextInvalidatedNotice,
  getStaleContextUiState,
  isExtensionContextInvalidatedError,
} from "./extensionContext";

describe("extension context guard helpers", () => {
  it("detects extension context invalidation errors", () => {
    expect(isExtensionContextInvalidatedError(new Error("Extension context invalidated."))).toBe(true);
    expect(
      isExtensionContextInvalidatedError(new Error("Could not establish connection. Receiving end does not exist.")),
    ).toBe(true);
  });

  it("does not flag unrelated errors", () => {
    expect(isExtensionContextInvalidatedError(new Error("Network timeout"))).toBe(false);
    expect(isExtensionContextInvalidatedError("plain string")).toBe(false);
  });

  it("returns stale-context UI state with disabled controls and recovery text", () => {
    const state = getStaleContextUiState();
    expect(state.disableActions).toBe(true);
    expect(state.disableModelControls).toBe(true);
    expect(state.statusMessage).toBe(formatContextInvalidatedNotice());
  });
});
