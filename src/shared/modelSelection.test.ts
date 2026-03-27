import { describe, expect, it } from "vitest";

import {
  chooseModelForSave,
  reconcileSavedModel,
  resolveGenerationModel,
} from "./modelSelection";

describe("model selection helpers", () => {
  it("keeps selected model when available model list is temporarily unavailable", () => {
    expect(chooseModelForSave("llama3.2:3b", [])).toBe("llama3.2:3b");
  });

  it("auto-selects the first available model when the saved one is missing", () => {
    const result = reconcileSavedModel("missing-model", ["llama3.2:3b", "qwen2.5:7b"]);
    expect(result).toEqual({
      model: "llama3.2:3b",
      wasAutoSelected: true,
      message: "Saved model not found, switched to llama3.2:3b.",
    });
  });

  it("resolves generation model by preferring request payload over saved model", () => {
    expect(resolveGenerationModel("qwen2.5:7b", "llama3.2:3b")).toBe("qwen2.5:7b");
    expect(resolveGenerationModel("", "llama3.2:3b")).toBe("llama3.2:3b");
  });
});
