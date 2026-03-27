# ChatGPT Local Mode Toggle

Add a floating on-page toggle to `chatgpt.com` that, when enabled, intercepts ChatGPT's API calls and reroutes them to the local Ollama instance. Full conversation history is preserved because ChatGPT already sends the full `messages[]` array in every request.

## User Review Required

> [!IMPORTANT]
> The [fetch](file:///c:/Users/KUSHAL/Desktop/stellaris/Stellaris-Project/src/shared/ollamaClient.ts#39-56) interceptor runs as a **world: "MAIN"** injected script so it can override `window.fetch` on the page itself (not just in the extension context). This is required for fetch interception to work and needs the `"scripting"` permission (already granted).

> [!WARNING]
> ChatGPT's network calls go to `https://chatgpt.com/backend-api/conversation` (not `api.openai.com`). The interceptor targets this URL pattern specifically. If OpenAI changes their internal API URL this will break.

## Proposed Changes

### Shared layer

#### [MODIFY] [constants.ts](file:///c:/Users/KUSHAL/Desktop/stellaris/Stellaris-Project/src/shared/constants.ts)
Add `LOCAL_MODE_KEY` storage key constant.

#### [MODIFY] [storage.ts](file:///c:/Users/KUSHAL/Desktop/stellaris/Stellaris-Project/src/shared/storage.ts)
Add `getLocalModeEnabled()` and `saveLocalModeEnabled()` helpers using `chrome.storage.local`.

---

### ChatGPT content scripts (new folder)

#### [NEW] [src/chatgpt/index.ts](file:///c:/Users/KUSHAL/Desktop/stellaris/Stellaris-Project/src/chatgpt/index.ts)
Entry point. Guards against double-injection, mounts the toggle UI, and injects the [fetch](file:///c:/Users/KUSHAL/Desktop/stellaris/Stellaris-Project/src/shared/ollamaClient.ts#39-56) interceptor script into the main world.

#### [NEW] [src/chatgpt/toggle.ts](file:///c:/Users/KUSHAL/Desktop/stellaris/Stellaris-Project/src/chatgpt/toggle.ts)
`ChatGptToggleUi` class. Renders a small floating pill button using Shadow DOM (same pattern as [LocalAssistUi](file:///c:/Users/KUSHAL/Desktop/stellaris/Stellaris-Project/src/content/ui.ts#45-889)). Reads initial state from `chrome.storage.local`, toggles state on click, and notifies [index.ts](file:///c:/Users/KUSHAL/Desktop/stellaris/Stellaris-Project/src/content/index.ts) to update the interceptor flag via `chrome.storage.onChanged`.

#### [NEW] [src/chatgpt/interceptor.ts](file:///c:/Users/KUSHAL/Desktop/stellaris/Stellaris-Project/src/chatgpt/interceptor.ts)
Contains the [fetch](file:///c:/Users/KUSHAL/Desktop/stellaris/Stellaris-Project/src/shared/ollamaClient.ts#39-56) override logic **as a serialized string** that gets injected into the MAIN world via `chrome.scripting.executeScript`. It:
- Overrides `window.fetch`
- Checks `window.__stellarisLocalMode` flag (set by [index.ts](file:///c:/Users/KUSHAL/Desktop/stellaris/Stellaris-Project/src/content/index.ts) via `window.postMessage`)
- If flag is ON and URL matches ChatGPT's conversation endpoint → rewrites request body to Ollama `/api/chat` format and streams the response back as a mock SSE stream matching OpenAI's format
- If flag is OFF → passes through to original fetch

---

### Build config

#### [MODIFY] [vite.config.ts](file:///c:/Users/KUSHAL/Desktop/stellaris/Stellaris-Project/vite.config.ts)
Add a second esbuild entry in the [closeBundle](file:///c:/Users/KUSHAL/Desktop/stellaris/Stellaris-Project/vite.config.ts#10-20) plugin for `src/chatgpt/index.ts → dist/chatgpt.js`.

---

### Manifest

#### [MODIFY] [manifest.json](file:///c:/Users/KUSHAL/Desktop/stellaris/Stellaris-Project/public/manifest.json)
Add `chatgpt.js` as a static content script matching `https://chatgpt.com/*`, running at `document_start` (needed to intercept fetch before ChatGPT initializes).

## Verification Plan

### Automated Tests
No existing tests cover ChatGPT-specific logic. No new unit tests are practical here since the core logic involves `window.fetch` override and Chrome extension APIs — both require a real browser environment.

### Manual Verification
1. Run `npm run build` in the project root
2. Open `chrome://extensions` → Enable Developer Mode → Load Unpacked → select the `dist/` folder
3. Navigate to `https://chatgpt.com`
4. Confirm a small **"🔴 Local Mode: OFF"** floating pill appears in the bottom-right corner
5. Start Ollama locally: `ollama serve` and `ollama pull llama3.2`
6. In extension Options, set endpoint to `http://localhost:11434` and select `llama3.2`  
7. Click the toggle → it should turn **"🟢 Local Mode: ON"**
8. Type a message in ChatGPT and send — response should come from Ollama (may differ in style from GPT-4)
9. Click toggle again → OFF → send another message → should go to OpenAI normally
10. Verify conversation history works: send multiple messages in local mode, check that context is preserved across turns
