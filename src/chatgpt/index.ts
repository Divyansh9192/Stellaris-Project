import { ChatGptToggleUi } from "./toggle";
import { getLocalModeEnabled, saveLocalModeEnabled, getSettings } from "../shared/storage";

declare global {
  interface Window {
    __stellarisLocalAssistChatGptLoaded?: boolean;
    __stellarisLocalMode?: boolean;
  }
}

if (!window.__stellarisLocalAssistChatGptLoaded) {
  window.__stellarisLocalAssistChatGptLoaded = true;

  /**
   * The fetch interceptor lives in chatgpt-interceptor.js (MAIN world, declared in manifest.json).
   * This ISOLATED-world script communicates with it via window.postMessage.
   */
  const syncFlagToPage = (enabled: boolean, model: string): void => {
    window.postMessage({ type: "STELLARIS_SET_LOCAL_MODE", enabled }, "*");
    window.postMessage({ type: "STELLARIS_SET_MODEL", model }, "*");
  };

  const bootstrap = async (): Promise<void> => {
    const [enabled, settings] = await Promise.all([
      getLocalModeEnabled(),
      getSettings(),
    ]);

    syncFlagToPage(enabled, settings.selectedModel);

    new ChatGptToggleUi(enabled, async (nextEnabled) => {
      await saveLocalModeEnabled(nextEnabled);
      const currentSettings = await getSettings();
      syncFlagToPage(nextEnabled, currentSettings.selectedModel);
    });

    // Keep model in sync if options page saves new settings
    chrome.storage.onChanged.addListener((changes) => {
      if (changes["stellarisSettings"]) {
        getSettings().then((s) => {
          syncFlagToPage(window.__stellarisLocalMode ?? false, s.selectedModel);
        });
      }
    });
  };

  void bootstrap();
}
