export const isForbiddenGenerationErrorMessage = (message: string): boolean => /status\s*403/i.test(message);

export const areActionsAllowed = (
  hasSelectedModel: boolean,
  generationHealthOk: boolean,
  isHealthChecking: boolean,
): boolean => hasSelectedModel && generationHealthOk && !isHealthChecking;

export const buildForbiddenGuidance = (
  endpoint: string,
  model: string,
  reason?: string,
  bodySnippet?: string,
): string => {
  return [
    `Endpoint: ${endpoint}`,
    `Model: ${model}`,
    "",
    "Fix steps:",
    "1. Allow your Chrome extension origin in Ollama's origin/CORS config.",
    "2. Restart Ollama.",
    "3. Click Refresh in this popup to re-check.",
    "",
    reason ? `Reason: ${reason}` : "",
    bodySnippet ? `Response snippet: ${bodySnippet}` : "",
  ].filter(Boolean).join("\n");
};
