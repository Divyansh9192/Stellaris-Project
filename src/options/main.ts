import "./options.css";

import { chooseModelForSave } from "../shared/modelSelection";
import { createId } from "../shared/ids";
import { normalizeEndpoint } from "../shared/loopback";
import { getGrantedSiteDisplayState, getSettings, saveSettings } from "../shared/storage";
import type { ExtensionSettings, ListModelsResponse, PromptAction, RuntimeEnvelope } from "../shared/types";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Options root was not found.");
}

app.innerHTML = `
  <main class="page">
    <section class="hero card">
      <div>
        <p class="eyebrow">Local-only Chrome extension</p>
        <h1>Stellaris Local Assist</h1>
        <p class="lede">Generate replies, rewrites, summaries, and custom text actions with Ollama running on your own machine.</p>
      </div>
      <div class="privacy-pill">Selected text only. No cloud fallback.</div>
    </section>

    <section class="grid">
      <article class="card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Ollama</p>
            <h2>Endpoint and model</h2>
          </div>
          <button id="save-settings" class="primary-button" type="button">Save settings</button>
        </div>

        <label class="field">
          <span>Endpoint</span>
          <input id="endpoint-url" type="text" spellcheck="false" placeholder="http://localhost:11434" />
        </label>

        <div class="row">
          <label class="field grow">
            <span>Local model</span>
            <select id="model-select"></select>
          </label>
          <button id="refresh-models" class="secondary-button align-end" type="button">Refresh models</button>
        </div>

        <p id="settings-status" class="status"></p>
        <p id="models-status" class="subtle"></p>
      </article>

      <article class="card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Prompt actions</p>
            <h2>Named actions</h2>
          </div>
          <button id="add-action" class="secondary-button" type="button">Add action</button>
        </div>

        <p class="subtle">Supported variables: <code>{{selection}}</code>, <code>{{pageTitle}}</code>, <code>{{pageUrl}}</code>.</p>
        <div id="actions-list" class="actions-list"></div>
      </article>
    </section>

    <section class="grid">
      <article class="card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Access</p>
            <h2>Approved sites</h2>
          </div>
        </div>
        <p class="subtle">The extension only runs on sites you explicitly approve from the toolbar button or keyboard shortcut.</p>
        <div id="granted-sites" class="sites-list"></div>
      </article>

      <article class="card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Shortcuts and privacy</p>
            <h2>Operator notes</h2>
          </div>
        </div>
        <ul class="notes">
          <li>Keyboard shortcuts are managed by Chrome at <code>chrome://extensions/shortcuts</code>.</li>
          <li>The extension stores settings only: endpoint, selected model, actions, and granted-site labels.</li>
          <li>Generation requests include only the selected text, page title, and page URL.</li>
          <li>Only loopback Ollama endpoints are accepted in v1.</li>
        </ul>
      </article>
    </section>
  </main>
`;

const endpointInput = app.querySelector<HTMLInputElement>("#endpoint-url");
const modelSelect = app.querySelector<HTMLSelectElement>("#model-select");
const saveButton = app.querySelector<HTMLButtonElement>("#save-settings");
const refreshModelsButton = app.querySelector<HTMLButtonElement>("#refresh-models");
const addActionButton = app.querySelector<HTMLButtonElement>("#add-action");
const settingsStatus = app.querySelector<HTMLParagraphElement>("#settings-status");
const modelsStatus = app.querySelector<HTMLParagraphElement>("#models-status");
const actionsList = app.querySelector<HTMLDivElement>("#actions-list");
const grantedSites = app.querySelector<HTMLDivElement>("#granted-sites");

if (!endpointInput || !modelSelect || !saveButton || !refreshModelsButton || !addActionButton || !settingsStatus || !modelsStatus || !actionsList || !grantedSites) {
  throw new Error("Options UI failed to initialize.");
}

let availableModels: string[] = [];
let currentSettings: ExtensionSettings | null = null;

const createCustomAction = (): PromptAction => ({
  id: createId(),
  name: "Custom action",
  description: "A custom plain-text local action.",
  template: [
    "Provide a helpful plain-text response for the selected text below.",
    "",
    "Page title: {{pageTitle}}",
    "Page URL: {{pageUrl}}",
    "",
    "Selected text:",
    "{{selection}}",
  ].join("\n"),
});

const readActionsFromDom = (): PromptAction[] => {
  const cards = [...actionsList.querySelectorAll<HTMLDivElement>("[data-action-id]")];
  return cards.map((card) => ({
    id: card.dataset.actionId ?? createId(),
    name: card.querySelector<HTMLInputElement>("[data-role='name']")?.value.trim() || "Untitled action",
    description: card.querySelector<HTMLInputElement>("[data-role='description']")?.value.trim() || undefined,
    template: card.querySelector<HTMLTextAreaElement>("[data-role='template']")?.value.trim() || "{{selection}}",
  }));
};

const renderActions = (actions: PromptAction[]): void => {
  actionsList.replaceChildren();

  for (const action of actions) {
    const card = document.createElement("div");
    card.className = "action-card";
    card.dataset.actionId = action.id;
    card.innerHTML = `
      <div class="row gap-top">
        <label class="field grow">
          <span>Name</span>
          <input data-role="name" type="text" value="${action.name.replace(/"/g, "&quot;")}" />
        </label>
        <button class="danger-button align-end" type="button" data-role="remove-action">Remove</button>
      </div>
      <label class="field gap-top">
        <span>Description</span>
        <input data-role="description" type="text" value="${(action.description ?? "").replace(/"/g, "&quot;")}" />
      </label>
      <label class="field gap-top">
        <span>Template</span>
        <textarea data-role="template" rows="8">${action.template}</textarea>
      </label>
    `;
    actionsList.appendChild(card);
  }
};

const renderModelOptions = (preferredModel: string): void => {
  modelSelect.replaceChildren();

  const modelsForSelect = availableModels.length > 0
    ? availableModels
    : preferredModel ? [preferredModel] : [];

  const placeholder = document.createElement("option");
  placeholder.value = "";
  if (availableModels.length > 0) {
    placeholder.textContent = "Choose a local model";
  } else if (preferredModel) {
    placeholder.textContent = "Using saved model";
  } else {
    placeholder.textContent = "No models detected";
  }
  modelSelect.appendChild(placeholder);

  for (const model of modelsForSelect) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    modelSelect.appendChild(option);
  }

  modelSelect.value = modelsForSelect.includes(preferredModel) ? preferredModel : "";
  modelSelect.disabled = modelsForSelect.length === 0;
};

const isLoopbackOrigin = (originPattern: string): boolean =>
  originPattern.startsWith("http://localhost/") || originPattern.startsWith("http://127.0.0.1/");

const loadGrantedSites = async (): Promise<void> => {
  const permissions = await chrome.permissions.getAll();
  const labels = await getGrantedSiteDisplayState();
  const origins = (permissions.origins ?? []).filter(
    (originPattern) => /^https?:\/\//.test(originPattern) && !isLoopbackOrigin(originPattern),
  );

  grantedSites.replaceChildren();

  if (origins.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "subtle";
    emptyState.textContent = "No sites approved yet.";
    grantedSites.appendChild(emptyState);
    return;
  }

  for (const origin of origins.sort()) {
    const row = document.createElement("div");
    row.className = "site-row";

    const label = document.createElement("div");
    label.innerHTML = `<strong>${labels[origin] ?? origin}</strong><span>${origin}</span>`;

    const revokeButton = document.createElement("button");
    revokeButton.type = "button";
    revokeButton.className = "danger-button";
    revokeButton.textContent = "Revoke";
    revokeButton.addEventListener("click", async () => {
      await chrome.permissions.remove({ origins: [origin] });
      settingsStatus.textContent = `Revoked access for ${origin}.`;
      await loadGrantedSites();
    });

    row.append(label, revokeButton);
    grantedSites.appendChild(row);
  }
};

const refreshModels = async (preferredModel: string): Promise<void> => {
  try {
    const endpointUrl = normalizeEndpoint(endpointInput.value);
    endpointInput.value = endpointUrl;
    modelsStatus.textContent = "Checking your local Ollama models...";

    const response = (await chrome.runtime.sendMessage({
      type: "LIST_MODELS",
      payload: { endpointUrl },
    } satisfies RuntimeEnvelope<"LIST_MODELS">)) as ListModelsResponse;

    availableModels = response.models;
    renderModelOptions(preferredModel);
    modelsStatus.textContent = availableModels.length > 0
      ? `Detected ${availableModels.length} local model${availableModels.length === 1 ? "" : "s"}.`
      : "No local models were detected at that endpoint.";
  } catch (error) {
    const fallbackModel = modelSelect.value || preferredModel || currentSettings?.selectedModel || "";
    renderModelOptions(fallbackModel);
    modelsStatus.textContent = error instanceof Error ? error.message : "Model discovery failed.";
  }
};

const handleSave = async (): Promise<void> => {
  settingsStatus.textContent = "Saving...";

  try {
    const endpointUrl = normalizeEndpoint(endpointInput.value);
    endpointInput.value = endpointUrl;

    const actions = readActionsFromDom();
    const selectedModel = chooseModelForSave(modelSelect.value, availableModels);

    await saveSettings({
      endpointUrl,
      selectedModel,
      actions,
    });
    currentSettings = { endpointUrl, selectedModel, actions };

    settingsStatus.textContent = selectedModel
      ? `Settings saved. Selected model: ${selectedModel}.`
      : "Settings saved. No model selected yet.";
  } catch (error) {
    settingsStatus.textContent = error instanceof Error ? error.message : "Failed to save settings.";
  }
};

const initialize = async (): Promise<void> => {
  const settings = await getSettings();
  currentSettings = settings;
  endpointInput.value = settings.endpointUrl;
  renderActions(settings.actions);
  await refreshModels(settings.selectedModel);
  await loadGrantedSites();
  settingsStatus.textContent = "Ready.";
};

addActionButton.addEventListener("click", () => {
  const nextActions = [...readActionsFromDom(), createCustomAction()];
  renderActions(nextActions);
});

refreshModelsButton.addEventListener("click", () => {
  const preferred = modelSelect.value || currentSettings?.selectedModel || "";
  void refreshModels(preferred);
});

saveButton.addEventListener("click", () => {
  void handleSave();
});

actionsList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.dataset.role !== "remove-action") {
    return;
  }

  const card = target.closest<HTMLDivElement>("[data-action-id]");
  card?.remove();
});

void initialize();
