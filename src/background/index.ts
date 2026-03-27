import { CONTENT_SCRIPT_ID_PREFIX, GENERATION_PORT_NAME } from "../shared/constants";
import { resolveGenerationModel } from "../shared/modelSelection";
import { checkOllamaGenerationHealth, fetchOllamaModels, streamOllamaGenerate } from "../shared/ollamaClient";
import { interpolateTemplate } from "../shared/template";
import { getGrantedSiteDisplayState, getSettings, saveGrantedSiteDisplayState } from "../shared/storage";
import type {
  AnyRuntimeEnvelope,
  BootstrapTabPayload,
  GenerationChunkPayload,
  GenerationDonePayload,
  GenerationErrorPayload,
  GenerationHealthResponse,
  ListModelsResponse,
  RuntimeEnvelope,
  RuntimeMessageMap,
  RuntimeMessageType,
  StartGenerationPayload,
} from "../shared/types";

const activeGenerations = new Map<string, AbortController>();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isHttpPage = (url: string): boolean => /^https?:\/\//.test(url);

const getOriginPattern = (url: string): string => {
  const parsed = new URL(url);
  return `${parsed.origin}/*`;
};

const getContentScriptId = (originPattern: string): string =>
  `${CONTENT_SCRIPT_ID_PREFIX}-${originPattern.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;

const isLoopbackOrigin = (originPattern: string): boolean =>
  originPattern.startsWith("http://localhost/") || originPattern.startsWith("http://127.0.0.1/");

const getApprovedSiteOrigins = async (): Promise<string[]> => {
  const permissions = await chrome.permissions.getAll();
  return (permissions.origins ?? []).filter((originPattern) => isHttpPage(originPattern) && !isLoopbackOrigin(originPattern));
};

const syncRegisteredContentScripts = async (): Promise<void> => {
  const approvedOrigins = await getApprovedSiteOrigins();
  const desiredScripts = approvedOrigins.map((originPattern) => ({
    id: getContentScriptId(originPattern),
    matches: [originPattern],
    js: ["content.js"],
    persistAcrossSessions: true,
    runAt: "document_idle" as const,
  }));
  const desiredIds = new Set(desiredScripts.map((script) => script.id));

  const existingScripts = await chrome.scripting.getRegisteredContentScripts();
  const managedScripts = existingScripts.filter((script) => script.id.startsWith(CONTENT_SCRIPT_ID_PREFIX));

  const staleIds = managedScripts
    .filter((script) => !desiredIds.has(script.id))
    .map((script) => script.id);

  if (staleIds.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: staleIds });
  }

  const existingIds = new Set(managedScripts.map((script) => script.id));
  const missingScripts = desiredScripts.filter((script) => !existingIds.has(script.id));

  if (missingScripts.length > 0) {
    await chrome.scripting.registerContentScripts(missingScripts);
  }
};

const saveGrantedSiteLabel = async (originPattern: string, url: string): Promise<void> => {
  const labels = await getGrantedSiteDisplayState();
  const parsed = new URL(url);
  labels[originPattern] = parsed.host;
  await saveGrantedSiteDisplayState(labels);
};

const pruneGrantedSiteLabels = async (): Promise<void> => {
  const labels = await getGrantedSiteDisplayState();
  const approvedOrigins = new Set(await getApprovedSiteOrigins());
  const nextLabels = Object.fromEntries(
    Object.entries(labels).filter(([originPattern]) => approvedOrigins.has(originPattern)),
  );
  await saveGrantedSiteDisplayState(nextLabels);
};

const postToTab = async <T extends RuntimeMessageType>(
  tabId: number,
  message: RuntimeEnvelope<T>,
  attempts = 8,
): Promise<void> => {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
      return;
    } catch (error) {
      lastError = error;
      await delay(120);
    }
  }

  throw lastError;
};

const postPortMessage = <T extends RuntimeMessageType>(
  port: chrome.runtime.Port,
  type: T,
  payload: RuntimeMessageMap[T]["request"],
): void => {
  port.postMessage({
    type,
    payload,
  } satisfies RuntimeEnvelope<T>);
};

const streamGeneration = async (port: chrome.runtime.Port, payload: StartGenerationPayload): Promise<void> => {
  const settings = await getSettings();
  const action = settings.actions.find((candidate) => candidate.id === payload.actionId);
  const modelToUse = resolveGenerationModel((payload as { model?: string }).model, settings.selectedModel);

  if (!modelToUse) {
    postPortMessage(port, "GENERATION_ERROR", {
      requestId: payload.requestId,
      message: "Pick a local Ollama model in the extension options before generating.",
    } satisfies GenerationErrorPayload);
    return;
  }

  if (!action) {
    postPortMessage(port, "GENERATION_ERROR", {
      requestId: payload.requestId,
      message: "The selected action could not be found. Refresh the page and try again.",
    } satisfies GenerationErrorPayload);
    return;
  }

  const controller = new AbortController();
  activeGenerations.set(payload.requestId, controller);

  try {
    const fullText = await streamOllamaGenerate({
      endpointUrl: settings.endpointUrl,
      model: modelToUse,
      prompt: interpolateTemplate(action.template, payload.context),
      signal: controller.signal,
      onChunk: (chunk) => {
        postPortMessage(port, "GENERATION_CHUNK", {
          requestId: payload.requestId,
          chunk,
        } satisfies GenerationChunkPayload);
      },
    });

    postPortMessage(port, "GENERATION_DONE", {
      requestId: payload.requestId,
      fullText,
    } satisfies GenerationDonePayload);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Generation stopped."
        : error instanceof Error
          ? error.message
          : "Generation failed.";

    postPortMessage(port, "GENERATION_ERROR", {
      requestId: payload.requestId,
      message,
    } satisfies GenerationErrorPayload);
  } finally {
    activeGenerations.delete(payload.requestId);
  }
};

const handleGenerationHealthCheck = async (
  payload: RuntimeMessageMap["CHECK_GENERATION_HEALTH"]["request"],
): Promise<GenerationHealthResponse> => {
  const settings = await getSettings();
  const endpointUrl = payload.endpointUrl || settings.endpointUrl;
  return checkOllamaGenerationHealth({
    endpointUrl,
    model: payload.model,
  });
};

/**
 * Called by the popup after the user has already granted permission for a site.
 * Syncs content scripts and injects + opens the helper on the given tab.
 */
const handleBootstrapTab = async (
  payload: BootstrapTabPayload,
): Promise<RuntimeMessageMap["BOOTSTRAP_TAB"]["response"]> => {
  try {
    await saveGrantedSiteLabel(payload.originPattern, payload.tabUrl);
    await syncRegisteredContentScripts();
    await chrome.scripting.executeScript({
      target: { tabId: payload.tabId },
      files: ["content.js"],
    });
    await postToTab(payload.tabId, {
      type: "OPEN_HELPER",
      payload: null,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to bootstrap tab.",
    };
  }
};

const handleRuntimeMessage = (
  message: AnyRuntimeEnvelope,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean => {
  if (message.type === "BOOTSTRAP_TAB") {
    void handleBootstrapTab(message.payload).then(sendResponse);
    return true;
  }

  if (message.type === "LIST_MODELS") {
    void (async () => {
      const settings = await getSettings();
      const endpointUrl = message.payload?.endpointUrl || settings.endpointUrl;
      const models = await fetchOllamaModels(endpointUrl);
      sendResponse({ models } satisfies ListModelsResponse);
    })().catch((error: unknown) => {
      console.error("Failed to fetch models", error);
      sendResponse({ models: [] } satisfies ListModelsResponse);
    });
    return true;
  }

  if (message.type === "CHECK_GENERATION_HEALTH") {
    void handleGenerationHealthCheck(message.payload).then(sendResponse).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : "Generation health check failed.";
      sendResponse({ ok: false, reason } satisfies GenerationHealthResponse);
    });
    return true;
  }

  return false;
};

chrome.runtime.onInstalled.addListener(() => {
  void syncRegisteredContentScripts();
  void pruneGrantedSiteLabels();
});

chrome.runtime.onStartup.addListener(() => {
  void syncRegisteredContentScripts();
  void pruneGrantedSiteLabels();
});

chrome.permissions.onAdded.addListener(() => {
  void syncRegisteredContentScripts();
  void pruneGrantedSiteLabels();
});

chrome.permissions.onRemoved.addListener(() => {
  void syncRegisteredContentScripts();
  void pruneGrantedSiteLabels();
});

chrome.runtime.onMessage.addListener(handleRuntimeMessage);

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== GENERATION_PORT_NAME) {
    return;
  }

  const ownedRequestIds = new Set<string>();

  port.onMessage.addListener((message: AnyRuntimeEnvelope) => {
    if (message.type === "START_GENERATION") {
      ownedRequestIds.add(message.payload.requestId);
      void streamGeneration(port, message.payload);
    }

    if (message.type === "ABORT_GENERATION") {
      activeGenerations.get(message.payload.requestId)?.abort();
    }
  });

  port.onDisconnect.addListener(() => {
    for (const requestId of ownedRequestIds) {
      activeGenerations.get(requestId)?.abort();
    }
  });
});

/**
 * The keyboard shortcut handler. If the site already has permission, inject
 * the content script and open the helper directly. If not, open the popup so
 * the user can grant access with a proper user gesture.
 */
chrome.commands.onCommand.addListener((command) => {
  if (command !== "open-helper") {
    return;
  }

  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !tab.url || !/^https?:\/\//.test(tab.url)) {
      return;
    }

    const originPattern = `${new URL(tab.url).origin}/*`;
    const alreadyGranted = await chrome.permissions.contains({ origins: [originPattern] });

    if (alreadyGranted) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      await postToTab(tab.id, { type: "OPEN_HELPER", payload: null });
    } else {
      // Open the popup so the user can grant access with a user gesture.
      // chrome.action.openPopup() requires Chrome 127+; fall back gracefully.
      try {
        await (chrome.action as typeof chrome.action & { openPopup?: () => Promise<void> }).openPopup?.();
      } catch {
        // If openPopup is unavailable or fails, the user needs to click the icon.
      }
    }
  })();
});
