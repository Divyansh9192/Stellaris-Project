# Stellaris Local Assist

Privacy-first Chrome extension for local writing assistance powered by [Ollama](https://ollama.com/) running on your own machine.

Stellaris helps you generate replies, rewrites, summaries, and custom outputs from selected text without sending data to cloud APIs.

## Table of contents

- [Why Stellaris](#why-stellaris)
- [Features](#features)
- [How it works](#how-it-works)
- [Project structure](#project-structure)
- [Requirements](#requirements)
- [Quick start (users)](#quick-start-users)
- [Developer setup](#developer-setup)
- [Usage guide](#usage-guide)
- [Permissions and privacy](#permissions-and-privacy)
- [Security model](#security-model)
- [Troubleshooting](#troubleshooting)
- [Store assets](#store-assets)
- [Contributing](#contributing)
- [License](#license)

## Why Stellaris

Most writing assistants are cloud-first. Stellaris is local-first by design:

- **Local inference only** via Ollama loopback endpoints.
- **Explicit site permission model** (runs only on sites you approve).
- **Minimal data exposure** (selected text, page title, page URL).
- **No telemetry** and no hidden remote fallback.

## Features

- Action-driven generation:
  - **Reply**
  - **Rewrite**
  - **Summarize**
  - **Custom named actions** with templates
- Streaming token output from Ollama (`/api/generate`).
- Copy generated output to clipboard.
- Safe explicit insert back into editable fields (input, textarea, contenteditable).
- Per-site access controls with easy revoke in options.
- Model discovery from Ollama (`/api/tags`) and in-UI model picker.
- Keyboard shortcut support:
  - **Windows/Linux:** `Ctrl+Shift+L`
  - **macOS:** `Command+Shift+L`

## How it works

1. You select text on a page.
2. You open Stellaris via extension popup or keyboard shortcut.
3. If site access was not previously granted, Stellaris asks for permission for that site origin.
4. The content script opens an inline helper UI.
5. Stellaris sends a prompt (template + selected text + page metadata) to your local Ollama server.
6. Output streams back into the UI, where you can copy or insert it.

## Project structure

```text
.
├── public/
│   ├── manifest.json                 # Chrome MV3 manifest
│   ├── icons/                        # Extension icons
│   └── store-assets/                 # Privacy policy, rationale, screenshots
├── src/
│   ├── background/                   # Service worker: permissions, scripts, generation relay
│   ├── content/                      # In-page helper UI, selection, insertion logic
│   ├── options/                      # Options page (endpoint/model/actions/sites)
│   ├── popup/                        # Toolbar popup permission/bootstrap flow
│   └── shared/                       # Shared types, storage, Ollama client, defaults
├── options.html
├── popup.html
├── vite.config.ts
└── package.json
```

## Requirements

- **Node.js** 18+ (recommended: current LTS)
- **npm** 9+
- **Chrome** with Manifest V3 support (manifest currently declares minimum Chrome 116)
- **Ollama** installed and running locally
- At least one Ollama model pulled locally, for example:
  - `ollama pull llama3.1`

## Quick start (users)

1. Build the extension:
   ```bash
   npm install
   npm run build
   ```
2. In Chrome, go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the project `dist` directory.
5. Open the extension **Options** page:
   - Confirm endpoint (default: `http://localhost:11434`)
   - Click **Refresh models**
   - Select a model
   - Save settings
6. Open any website, select text, and trigger Stellaris from:
   - Toolbar icon, or
   - Keyboard shortcut (`Ctrl+Shift+L` / `Cmd+Shift+L`)

## Developer setup

```bash
npm install
npm run test
npm run build
```

Available scripts:

- `npm run build` – production build to `dist`
- `npm run dev` – watch build for development
- `npm run test` – run unit tests once (Vitest)
- `npm run test:watch` – run tests in watch mode

## Usage guide

### 1) Configure endpoint and model

From Options:

- Endpoint must be loopback HTTP (`localhost` or `127.0.0.1`)
- Refresh available models from Ollama
- Select one model for generation

### 2) Define prompt actions

Use built-in actions or create custom ones. Templates support:

- `{{selection}}`
- `{{pageTitle}}`
- `{{pageUrl}}`

### 3) Grant site access

Access is granted per origin from the popup/shortcut flow. You can revoke any site in Options.

### 4) Generate and apply

In the inline helper:

- Pick action
- Generate output
- Copy text, or
- Insert text into supported editable elements

## Permissions and privacy

See:

- [`public/store-assets/privacy-policy.md`](./public/store-assets/privacy-policy.md)
- [`public/store-assets/permission-rationale.md`](./public/store-assets/permission-rationale.md)

Current permission model:

- `storage` – saves local settings and granted-site labels
- `scripting` – registers/injects content scripts after user approval
- `activeTab` – bootstrap current tab from explicit user action
- `optional_host_permissions` (`http://*/*`, `https://*/*`) – request site access only when needed
- fixed loopback host permissions (`http://localhost/*`, `http://127.0.0.1/*`) – local Ollama API calls

## Security model

- Endpoint validation rejects non-loopback endpoints.
- No cloud fallback is implemented.
- Generated content and selected page text are not persisted in storage.
- Extension stores only:
  - endpoint URL
  - selected model
  - prompt actions
  - granted-site display labels

## Troubleshooting

### No models found

- Confirm Ollama is running.
- Verify endpoint in Options (`http://localhost:11434` by default).
- Ensure you have pulled at least one model (`ollama list`).

### Generation fails

- Re-check selected model and endpoint.
- Confirm model exists locally and is loadable by Ollama.
- Verify local firewall/proxy rules are not blocking loopback calls.

### Shortcut does not open helper

- Ensure text is selected on an `http`/`https` page.
- Check `chrome://extensions/shortcuts` for keybinding conflicts.
- Grant site permission from popup if first run on that site.

## Store assets

Marketing and store metadata are under:

- [`public/store-assets/`](./public/store-assets/)
- [`public/store-assets/screenshots/`](./public/store-assets/screenshots/)

> Note: current screenshots are placeholders and should be replaced before publishing.

## Contributing

1. Fork and create a feature branch.
2. Run tests and build locally.
3. Keep privacy/local-only guarantees intact.
4. Open a PR with clear scope and rationale.

## License

No license file is currently present in this repository.

For public distribution (including Chrome Web Store release), add a LICENSE file before publishing. A permissive license such as MIT or Apache-2.0 is a common choice if you intend others to use and modify the project. Without an explicit license, default copyright restrictions apply.
