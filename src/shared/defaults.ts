import { DEFAULT_ENDPOINT } from "./constants";
import type { ExtensionSettings, PromptAction } from "./types";

const createAction = (
  id: string,
  name: string,
  template: string,
  description: string,
): PromptAction => ({
  id,
  name,
  template,
  description,
});

export const DEFAULT_ACTIONS: PromptAction[] = [
  createAction(
    "reply",
    "Reply",
    [
      "Draft a concise reply to the selected text below.",
      "Keep the answer plain text only.",
      "",
      "Page title: {{pageTitle}}",
      "Page URL: {{pageUrl}}",
      "",
      "Selected text:",
      "{{selection}}",
    ].join("\n"),
    "Draft a quick plain-text reply.",
  ),
  createAction(
    "rewrite",
    "Rewrite",
    [
      "Rewrite the selected text to improve clarity and flow.",
      "Preserve the original intent and return plain text only.",
      "",
      "Page title: {{pageTitle}}",
      "Page URL: {{pageUrl}}",
      "",
      "Selected text:",
      "{{selection}}",
    ].join("\n"),
    "Polish the current selection.",
  ),
  createAction(
    "summarize",
    "Summarize",
    [
      "Summarize the selected text in a compact, useful way.",
      "Return plain text only.",
      "",
      "Page title: {{pageTitle}}",
      "Page URL: {{pageUrl}}",
      "",
      "Selected text:",
      "{{selection}}",
    ].join("\n"),
    "Condense the selection.",
  ),
];

export const DEFAULT_SETTINGS: ExtensionSettings = {
  endpointUrl: DEFAULT_ENDPOINT,
  selectedModel: "",
  actions: DEFAULT_ACTIONS,
};
