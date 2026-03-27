import { DEFAULT_SETTINGS } from "./defaults";
import { GRANTED_SITE_LABELS_KEY, SETTINGS_KEY } from "./constants";
import { normalizeEndpoint } from "./loopback";
import type { ExtensionSettings, PromptAction } from "./types";

export type GrantedSiteDisplayState = Record<string, string>;

const cloneAction = (action: PromptAction): PromptAction => ({
  id: action.id,
  name: action.name,
  template: action.template,
  description: action.description,
});

const sanitizeAction = (action: PromptAction): PromptAction | null => {
  const id = action.id?.trim();
  const name = action.name?.trim();
  const template = action.template?.trim();

  if (!id || !name || !template) {
    return null;
  }

  return {
    id,
    name,
    template,
    description: action.description?.trim() || undefined,
  };
};

const normalizeStoredEndpoint = (value: string | undefined): string => {
  try {
    return normalizeEndpoint(value ?? DEFAULT_SETTINGS.endpointUrl);
  } catch {
    return DEFAULT_SETTINGS.endpointUrl;
  }
};

export const sanitizeSettings = (input: Partial<ExtensionSettings> | null | undefined): ExtensionSettings => {
  const actions = Array.isArray(input?.actions)
    ? input.actions.map(sanitizeAction).filter((value): value is PromptAction => Boolean(value))
    : [];

  return {
    endpointUrl: normalizeStoredEndpoint(input?.endpointUrl),
    selectedModel: typeof input?.selectedModel === "string" ? input.selectedModel.trim() : DEFAULT_SETTINGS.selectedModel,
    actions: actions.length > 0 ? actions.map(cloneAction) : DEFAULT_SETTINGS.actions.map(cloneAction),
  };
};

export const getSettings = async (): Promise<ExtensionSettings> => {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return sanitizeSettings(stored[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined);
};

export const saveSettings = async (settings: ExtensionSettings): Promise<void> => {
  await chrome.storage.local.set({
    [SETTINGS_KEY]: sanitizeSettings(settings),
  });
};

export const getGrantedSiteDisplayState = async (): Promise<GrantedSiteDisplayState> => {
  const stored = await chrome.storage.local.get(GRANTED_SITE_LABELS_KEY);
  return (stored[GRANTED_SITE_LABELS_KEY] as GrantedSiteDisplayState | undefined) ?? {};
};

export const saveGrantedSiteDisplayState = async (state: GrantedSiteDisplayState): Promise<void> => {
  await chrome.storage.local.set({
    [GRANTED_SITE_LABELS_KEY]: state,
  });
};
