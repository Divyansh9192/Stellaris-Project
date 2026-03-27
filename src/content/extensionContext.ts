export interface StaleContextUiState {
  statusMessage: string;
  disableActions: boolean;
  disableModelControls: boolean;
  clearOutput: boolean;
}

const INVALIDATED_PATTERNS = [
  "extension context invalidated",
  "context invalidated",
  "receiving end does not exist",
  "message port closed before a response was received",
];

export const isExtensionContextInvalidatedError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.trim().toLowerCase();
  return INVALIDATED_PATTERNS.some((pattern) => message.includes(pattern));
};

export const formatContextInvalidatedNotice = (): string =>
  "Extension was reloaded or updated. Refresh this tab and reopen Local Assist.";

export const getStaleContextUiState = (): StaleContextUiState => ({
  statusMessage: formatContextInvalidatedNotice(),
  disableActions: true,
  disableModelControls: true,
  clearOutput: true,
});
