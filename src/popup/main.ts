import "./popup.css";
import type { BootstrapTabPayload, RuntimeEnvelope } from "../shared/types";

const isHttpPage = (url: string): boolean => /^https?:\/\//.test(url);

const getOriginPattern = (url: string): string => {
  const parsed = new URL(url);
  return `${parsed.origin}/*`;
};

const isLoopbackOrigin = (originPattern: string): boolean =>
  originPattern.startsWith("http://localhost/") || originPattern.startsWith("http://127.0.0.1/");

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Popup root was not found.");
}

app.innerHTML = `
  <div class="title">Stellaris Local Assist</div>
  <p class="subtitle">Privacy-first writing assistance via Ollama.</p>
  <p id="status" class="status"></p>
  <button id="grant-btn" class="grant-button" type="button" hidden>Grant access to this site</button>
  <p class="hint" id="hint" hidden>You can revoke access any time from the extension options.</p>
`;

const statusEl = app.querySelector<HTMLParagraphElement>("#status")!;
const grantBtn = app.querySelector<HTMLButtonElement>("#grant-btn")!;
const hintEl = app.querySelector<HTMLParagraphElement>("#hint")!;

const setStatus = (message: string, isError = false): void => {
  statusEl.textContent = message;
  statusEl.className = isError ? "status error" : "status";
};

const closePopup = (): void => {
  window.close();
};

const bootstrapTab = async (tabId: number, tabUrl: string, originPattern: string): Promise<void> => {
  setStatus("Opening assistant…");
  grantBtn.disabled = true;

  const response = await chrome.runtime.sendMessage({
    type: "BOOTSTRAP_TAB",
    payload: { tabId, tabUrl, originPattern } satisfies BootstrapTabPayload,
  } satisfies RuntimeEnvelope<"BOOTSTRAP_TAB">);

  if (response?.ok) {
    closePopup();
  } else {
    setStatus(response?.error ?? "Failed to open the assistant. Try refreshing the page.", true);
    grantBtn.disabled = false;
  }
};

const initialize = async (): Promise<void> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id || !tab.url || !isHttpPage(tab.url)) {
    setStatus("Open a regular http or https page to use the assistant.", true);
    return;
  }

  const originPattern = getOriginPattern(tab.url);

  if (isLoopbackOrigin(originPattern)) {
    setStatus("The assistant is not available on localhost pages.", true);
    return;
  }

  const alreadyGranted = await chrome.permissions.contains({ origins: [originPattern] });

  if (alreadyGranted) {
    // Permission already granted — inject and open immediately.
    await bootstrapTab(tab.id, tab.url, originPattern);
    return;
  }

  // Show the grant button so the user can trigger the permission request
  // with an explicit click (required user gesture for chrome.permissions.request).
  setStatus(`Grant access to ${new URL(tab.url).host} to use the assistant.`);
  grantBtn.hidden = false;
  hintEl.hidden = false;

  grantBtn.addEventListener("click", async () => {
    grantBtn.disabled = true;
    setStatus("Requesting permission…");

    const granted = await chrome.permissions.request({ origins: [originPattern] });

    if (!granted) {
      setStatus("Permission was not granted. Click the button to try again.", true);
      grantBtn.disabled = false;
      return;
    }

    await bootstrapTab(tab.id!, tab.url!, originPattern);
  });
};

void initialize();
