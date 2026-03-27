# Stellaris Local Assist

Privacy-first Chrome extension that keeps lightweight writing assistance on your machine by talking only to a local Ollama server.

## What it does

- Works on user-approved sites only.
- Reads only the currently selected text plus page title and URL.
- Streams reply, rewrite, summarize, and custom prompt actions from Ollama.
- Lets the user copy every result and explicitly insert into supported editors.

## Local development

1. Install dependencies with `npm install`.
2. Build with `npm run build`.
3. Load `dist` as an unpacked Chrome extension.
4. Open the extension options page, confirm the Ollama endpoint, refresh models, and choose one.

## Privacy model

- Model calls are restricted to `http://localhost/*` and `http://127.0.0.1/*`.
- User content and generations are not persisted.
- Only settings and granted-site display labels are stored in `chrome.storage.local`.
- No analytics, telemetry, or cloud fallback is included.
