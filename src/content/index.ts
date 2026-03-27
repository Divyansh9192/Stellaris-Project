import type { AnyRuntimeEnvelope } from "../shared/types";
import { isExtensionContextInvalidatedError } from "./extensionContext";
import { LocalAssistUi } from "./ui";
import { getCurrentSelectionSnapshot } from "./selection";

const SELECTION_SNAPSHOT_GRACE_MS = 1200;

declare global {
  interface Window {
    __stellarisLocalAssistLoaded?: boolean;
  }
}

if (!window.__stellarisLocalAssistLoaded) {
  window.__stellarisLocalAssistLoaded = true;

  const ui = new LocalAssistUi((message) => {
    console.info("[Stellaris Local Assist]", message);
  });

  let lastNonNullSnapshot = getCurrentSelectionSnapshot();
  let lastSnapshotAt = lastNonNullSnapshot ? Date.now() : 0;
  let frameRequested = false;
  const syncSelection = (): void => {
    if (frameRequested) {
      return;
    }

    frameRequested = true;
    window.requestAnimationFrame(() => {
      frameRequested = false;

      const snapshot = getCurrentSelectionSnapshot();
      if (snapshot) {
        lastNonNullSnapshot = snapshot;
        lastSnapshotAt = Date.now();
        ui.updateSelection(snapshot);
        return;
      }

      const hasRecentSnapshot = Boolean(lastNonNullSnapshot)
        && Date.now() - lastSnapshotAt <= SELECTION_SNAPSHOT_GRACE_MS;
      ui.updateSelection(hasRecentSnapshot ? lastNonNullSnapshot : null);

      if (!hasRecentSnapshot) {
        lastNonNullSnapshot = null;
      }
    });
  };

  document.addEventListener("selectionchange", syncSelection, true);
  document.addEventListener("mouseup", syncSelection, true);
  document.addEventListener("keyup", syncSelection, true);
  document.addEventListener("focusin", syncSelection, true);
  window.addEventListener("resize", syncSelection, true);
  window.addEventListener("scroll", syncSelection, true);

  chrome.runtime.onMessage.addListener((message: AnyRuntimeEnvelope) => {
    if (message.type === "OPEN_HELPER") {
      void ui.openFromShortcut(getCurrentSelectionSnapshot()).catch((error: unknown) => {
        if (!isExtensionContextInvalidatedError(error)) {
          console.error("[Stellaris Local Assist] Failed to open helper:", error);
        }
      });
    }

    if (message.type === "INSERT_RESULT") {
      ui.showNotice("Use the Insert button in the helper to place generated text safely.");
    }
  });

  syncSelection();
}
