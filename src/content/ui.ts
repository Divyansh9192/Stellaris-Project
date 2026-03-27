import { GENERATION_PORT_NAME } from "../shared/constants";
import { reconcileSavedModel } from "../shared/modelSelection";
import { createId } from "../shared/ids";
import { getSettings, saveSettings } from "../shared/storage";
import type {
  AnyRuntimeEnvelope,
  ExtensionSettings,
  GenerationChunkPayload,
  GenerationDonePayload,
  GenerationErrorPayload,
  GenerationHealthResponse,
  ListModelsResponse,
  RuntimeEnvelope,
} from "../shared/types";
import {
  formatContextInvalidatedNotice,
  getStaleContextUiState,
  isExtensionContextInvalidatedError,
} from "./extensionContext";
import { areActionsAllowed, buildForbiddenGuidance, isForbiddenGenerationErrorMessage } from "./healthState";
import { insertPlainText } from "./insertion";
import type { SelectionSnapshot } from "./selection";

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

const copyText = async (text: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
};

export class LocalAssistUi {
  private readonly host: HTMLDivElement;
  private readonly shadowRoot: ShadowRoot;
  private readonly toolbarButton: HTMLButtonElement;
  private readonly popover: HTMLDivElement;
  private readonly actionsWrap: HTMLDivElement;
  private readonly statusText: HTMLParagraphElement;
  private readonly outputText: HTMLPreElement;
  private readonly modelSelect: HTMLSelectElement;
  private readonly refreshModelsButton: HTMLButtonElement;
  private readonly openSettingsButton: HTMLButtonElement;
  private readonly modelsStatusText: HTMLParagraphElement;
  private readonly copyButton: HTMLButtonElement;
  private readonly insertButton: HTMLButtonElement;
  private readonly stopButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;

  private currentSnapshot: SelectionSnapshot | null = null;
  private currentSettings: ExtensionSettings | null = null;
  private currentRequestId: string | null = null;
  private generatedText = "";
  private availableModels: string[] = [];
  private isModelLoading = false;
  private isHealthChecking = false;
  private isStaleContext = false;
  private generationHealth: GenerationHealthResponse = { ok: false, reason: "Generation health not checked yet." };
  private port: chrome.runtime.Port | null = null;

  constructor(private readonly onStatus: (message: string) => void) {
    this.host = document.createElement("div");
    this.host.setAttribute("data-stellaris-local-assist", "true");
    this.host.style.all = "initial";
    this.host.style.position = "fixed";
    this.host.style.inset = "0";
    this.host.style.pointerEvents = "none";
    this.host.style.zIndex = "2147483647";

    this.shadowRoot = this.host.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        .toolbar {
          position: fixed;
          pointer-events: auto;
          border: 0;
          border-radius: 999px;
          background: linear-gradient(135deg, #0e7490, #155e75);
          color: #f8fafc;
          font: 600 13px/1.2 "Segoe UI", sans-serif;
          padding: 10px 14px;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.28);
          cursor: pointer;
        }

        .toolbar[hidden],
        .popover[hidden] {
          display: none;
        }

        .popover {
          position: fixed;
          width: min(380px, calc(100vw - 24px));
          max-height: min(70vh, 620px);
          overflow: auto;
          pointer-events: auto;
          background: #f8fafc;
          color: #0f172a;
          border-radius: 20px;
          border: 1px solid rgba(148, 163, 184, 0.4);
          box-shadow: 0 20px 48px rgba(15, 23, 42, 0.22);
          padding: 16px;
          font: 500 13px/1.45 "Segoe UI", sans-serif;
        }

        .title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 6px;
        }

        .title {
          font: 700 14px/1.2 "Segoe UI", sans-serif;
          color: #0f172a;
        }

        .close {
          border: 0;
          background: transparent;
          color: #334155;
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
        }

        .subtitle {
          margin: 0 0 12px;
          color: #475569;
        }

        .model-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          gap: 8px;
          margin-bottom: 8px;
          align-items: end;
        }

        .model-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .model-label {
          font: 600 12px/1.2 "Segoe UI", sans-serif;
          color: #334155;
        }

        .model-select {
          border: 1px solid rgba(148, 163, 184, 0.45);
          background: #ffffff;
          border-radius: 10px;
          padding: 8px 10px;
          font: 500 12px/1.2 "Segoe UI", sans-serif;
          color: #0f172a;
        }

        .inline-button {
          border: 1px solid rgba(14, 116, 144, 0.25);
          background: #ffffff;
          color: #0f172a;
          border-radius: 999px;
          padding: 8px 12px;
          cursor: pointer;
          font: 600 12px/1.2 "Segoe UI", sans-serif;
          white-space: nowrap;
        }

        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 12px;
        }

        .action-chip,
        .footer-button {
          border: 1px solid rgba(14, 116, 144, 0.25);
          background: #ffffff;
          color: #0f172a;
          border-radius: 999px;
          padding: 8px 12px;
          cursor: pointer;
          font: 600 12px/1.2 "Segoe UI", sans-serif;
        }

        .action-chip:hover,
        .footer-button:hover,
        .toolbar:hover,
        .inline-button:hover {
          filter: brightness(0.98);
        }

        .status {
          margin: 0 0 10px;
          color: #0f766e;
          min-height: 20px;
        }

        .models-status {
          margin: 0 0 10px;
          color: #64748b;
          min-height: 18px;
          font-size: 12px;
        }

        .output {
          margin: 0;
          min-height: 140px;
          background: #ffffff;
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 16px;
          padding: 12px;
          white-space: pre-wrap;
          word-break: break-word;
          color: #0f172a;
        }

        .footer {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }

        .footer-button[disabled],
        .action-chip[disabled],
        .inline-button[disabled],
        .model-select[disabled] {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .hint {
          margin-top: 10px;
          color: #64748b;
          font-size: 12px;
        }
      </style>
      <button class="toolbar" type="button" hidden>Local Assist</button>
      <section class="popover" hidden>
        <div class="title-row">
          <div class="title">Stellaris Local Assist</div>
          <button class="close" type="button" aria-label="Close">x</button>
        </div>
        <p class="subtitle">Selected text only. Replies stay on your machine through Ollama.</p>
        <div class="model-row">
          <label class="model-field">
            <span class="model-label">Model</span>
            <select class="model-select" data-model-select></select>
          </label>
          <button class="inline-button" type="button" data-refresh-models>Refresh</button>
          <button class="inline-button" type="button" data-open-settings>Settings</button>
        </div>
        <p class="models-status" data-model-status></p>
        <div class="actions"></div>
        <p class="status"></p>
        <pre class="output">Select a prompt action to generate a result.</pre>
        <div class="footer">
          <button class="footer-button" type="button" data-copy disabled>Copy</button>
          <button class="footer-button" type="button" data-insert hidden disabled>Insert</button>
          <button class="footer-button" type="button" data-stop hidden>Stop</button>
        </div>
        <div class="hint">Shortcuts can be remapped in chrome://extensions/shortcuts.</div>
      </section>
    `;

    this.toolbarButton = this.shadowRoot.querySelector(".toolbar") as HTMLButtonElement;
    this.popover = this.shadowRoot.querySelector(".popover") as HTMLDivElement;
    this.actionsWrap = this.shadowRoot.querySelector(".actions") as HTMLDivElement;
    this.statusText = this.shadowRoot.querySelector(".status") as HTMLParagraphElement;
    this.outputText = this.shadowRoot.querySelector(".output") as HTMLPreElement;
    this.modelSelect = this.shadowRoot.querySelector("[data-model-select]") as HTMLSelectElement;
    this.refreshModelsButton = this.shadowRoot.querySelector("[data-refresh-models]") as HTMLButtonElement;
    this.openSettingsButton = this.shadowRoot.querySelector("[data-open-settings]") as HTMLButtonElement;
    this.modelsStatusText = this.shadowRoot.querySelector("[data-model-status]") as HTMLParagraphElement;
    this.copyButton = this.shadowRoot.querySelector("[data-copy]") as HTMLButtonElement;
    this.insertButton = this.shadowRoot.querySelector("[data-insert]") as HTMLButtonElement;
    this.stopButton = this.shadowRoot.querySelector("[data-stop]") as HTMLButtonElement;
    this.closeButton = this.shadowRoot.querySelector(".close") as HTMLButtonElement;

    this.toolbarButton.addEventListener("click", () => {
      void this.openPopover();
    });
    this.closeButton.addEventListener("click", () => this.closePopover());
    this.copyButton.addEventListener("click", () => {
      void this.handleCopy();
    });
    this.insertButton.addEventListener("click", () => this.handleInsert());
    this.stopButton.addEventListener("click", () => this.abortGeneration());
    this.refreshModelsButton.addEventListener("click", () => {
      void this.refreshModels(false);
    });
    this.openSettingsButton.addEventListener("click", () => {
      void this.handleOpenOptions();
    });
    this.modelSelect.addEventListener("change", () => {
      void this.handleModelChange();
    });

    document.documentElement.appendChild(this.host);
  }

  updateSelection(snapshot: SelectionSnapshot | null): void {
    if (!this.popover.hidden) {
      if (snapshot) {
        this.currentSnapshot = snapshot;
      }
      return;
    }

    this.currentSnapshot = snapshot;

    if (!snapshot) {
      this.toolbarButton.hidden = true;
      return;
    }

    this.positionElement(this.toolbarButton, snapshot.rect, 8, 118, 40);
    this.toolbarButton.hidden = false;
  }

  async openFromShortcut(snapshot: SelectionSnapshot | null): Promise<void> {
    this.currentSnapshot = snapshot;
    await this.openPopover();
  }

  showNotice(message: string): void {
    this.toolbarButton.hidden = true;
    this.popover.hidden = false;
    this.statusText.textContent = message;
    this.outputText.textContent = "Select text first, then pick an action to generate a suggestion.";
    this.actionsWrap.replaceChildren();
    this.modelsStatusText.textContent = "";
    this.copyButton.disabled = true;
    this.insertButton.hidden = true;
    this.stopButton.hidden = true;
    this.positionDetachedPopover();
  }

  private ensurePort(): chrome.runtime.Port | null {
    if (this.isStaleContext) {
      return null;
    }

    if (this.port) {
      return this.port;
    }

    try {
      this.port = chrome.runtime.connect({ name: GENERATION_PORT_NAME });
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        this.handleStaleExtensionContext(error);
        return null;
      }
      throw error;
    }

    this.port.onMessage.addListener((message: AnyRuntimeEnvelope) => {
      if (!this.currentRequestId) {
        return;
      }

      if (message.type === "GENERATION_CHUNK") {
        const payload = message.payload as GenerationChunkPayload;
        if (payload.requestId !== this.currentRequestId) {
          return;
        }

        this.generatedText += payload.chunk;
        this.outputText.textContent = this.generatedText;
        this.copyButton.disabled = this.generatedText.length === 0;
      }

      if (message.type === "GENERATION_DONE") {
        const payload = message.payload as GenerationDonePayload;
        if (payload.requestId !== this.currentRequestId) {
          return;
        }

        this.currentRequestId = null;
        this.statusText.textContent = "Ready.";
        this.stopButton.hidden = true;
        this.copyButton.disabled = this.generatedText.length === 0;
        this.insertButton.hidden = !(this.currentSnapshot?.context.canInsert ?? false);
        this.insertButton.disabled = this.generatedText.length === 0;
        this.setActionsDisabled(false);
      }

      if (message.type === "GENERATION_ERROR") {
        const payload = message.payload as GenerationErrorPayload;
        if (payload.requestId !== this.currentRequestId) {
          return;
        }

        this.currentRequestId = null;
        this.stopButton.hidden = true;
        this.insertButton.hidden = !(this.currentSnapshot?.context.canInsert ?? false);
        this.insertButton.disabled = this.generatedText.length === 0;

        if (isForbiddenGenerationErrorMessage(payload.message)) {
          this.generationHealth = {
            ok: false,
            status: 403,
            reason: payload.message,
          };
          this.showForbiddenGuidance(payload.message);
        } else {
          this.statusText.textContent = payload.message;
          this.modelsStatusText.textContent = "Generation endpoint check failed.";
        }

        this.setActionsDisabled(false);
      }
    });

    this.port.onDisconnect.addListener(() => {
      this.port = null;
      this.currentRequestId = null;
      this.stopButton.hidden = true;
      this.setActionsDisabled(false);
    });

    return this.port;
  }

  private async openPopover(): Promise<void> {
    if (this.isStaleContext) {
      this.statusText.textContent = formatContextInvalidatedNotice();
      return;
    }

    const snapshot = this.currentSnapshot;
    if (!snapshot) {
      this.showNotice("No selected text detected.");
      return;
    }

    try {
      this.currentSettings = await getSettings();
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        this.handleStaleExtensionContext(error);
        return;
      }
      throw error;
    }
    this.generatedText = "";
    this.currentRequestId = null;
    this.availableModels = [];
    this.generationHealth = { ok: false, reason: "Generation health not checked yet." };
    this.copyButton.disabled = true;
    this.insertButton.hidden = !snapshot.context.canInsert;
    this.insertButton.disabled = true;
    this.stopButton.hidden = true;
    this.statusText.textContent = this.currentSettings.selectedModel
      ? "Checking generation endpoint health..."
      : "Choose a local model before generating.";
    this.outputText.textContent = "Select a prompt action to generate a result.";
    this.modelsStatusText.textContent = this.currentSettings.selectedModel
      ? `Using ${this.currentSettings.selectedModel}.`
      : "No model selected.";
    this.renderModelOptions(this.currentSettings.selectedModel);
    this.renderActions();

    this.toolbarButton.hidden = true;
    this.popover.hidden = false;
    this.positionElement(this.popover, snapshot.rect, 14, 380, 360);

    void this.refreshModels(true);
  }

  private renderActions(): void {
    const settings = this.currentSettings;
    this.actionsWrap.replaceChildren();

    if (!settings || settings.actions.length === 0) {
      const emptyState = document.createElement("span");
      emptyState.textContent = "No actions configured yet.";
      this.actionsWrap.appendChild(emptyState);
      return;
    }

    const enabled = this.areActionsEnabled();
    for (const action of settings.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "action-chip";
      button.textContent = action.name;
      button.disabled = !enabled;
      button.title = action.description ?? action.name;
      button.addEventListener("click", () => {
        void this.startGeneration(action.id);
      });
      this.actionsWrap.appendChild(button);
    }
  }

  private renderModelOptions(selectedModel: string): void {
    this.modelSelect.replaceChildren();

    const modelsForSelect = this.availableModels.length > 0
      ? this.availableModels
      : selectedModel ? [selectedModel] : [];

    const placeholder = document.createElement("option");
    placeholder.value = "";
    if (this.availableModels.length > 0) {
      placeholder.textContent = "Choose a local model";
    } else if (selectedModel) {
      placeholder.textContent = "Using saved model";
    } else {
      placeholder.textContent = "No models detected";
    }
    this.modelSelect.appendChild(placeholder);

    for (const model of modelsForSelect) {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      this.modelSelect.appendChild(option);
    }

    this.modelSelect.value = modelsForSelect.includes(selectedModel) ? selectedModel : "";
    this.modelSelect.disabled = this.isStaleContext || this.isModelLoading || modelsForSelect.length === 0;
  }

  private async refreshModels(autoResolveSavedModel: boolean): Promise<void> {
    if (!this.currentSettings || this.isStaleContext) {
      return;
    }

    this.isModelLoading = true;
    this.refreshModelsButton.disabled = true;
    this.renderModelOptions(this.currentSettings.selectedModel);
    this.modelsStatusText.textContent = "Checking your local Ollama models...";
    this.setActionsDisabled(false);

    try {
      const response = (await chrome.runtime.sendMessage({
        type: "LIST_MODELS",
        payload: { endpointUrl: this.currentSettings.endpointUrl },
      } satisfies RuntimeEnvelope<"LIST_MODELS">)) as ListModelsResponse;

      this.availableModels = response.models;

      if (autoResolveSavedModel) {
        const reconciled = reconcileSavedModel(this.currentSettings.selectedModel, this.availableModels);
        if (reconciled.model !== this.currentSettings.selectedModel) {
          this.currentSettings.selectedModel = reconciled.model;
          await saveSettings(this.currentSettings);
        }

        if (reconciled.message) {
          this.modelsStatusText.textContent = reconciled.message;
        } else if (this.availableModels.length > 0) {
          this.modelsStatusText.textContent = `Detected ${this.availableModels.length} local model${this.availableModels.length === 1 ? "" : "s"}.`;
        } else {
          this.modelsStatusText.textContent = "No local models were detected at the configured endpoint.";
        }
      } else {
        this.modelsStatusText.textContent = this.availableModels.length > 0
          ? `Detected ${this.availableModels.length} local model${this.availableModels.length === 1 ? "" : "s"}.`
          : "No local models were detected at the configured endpoint.";
      }

      this.renderModelOptions(this.currentSettings.selectedModel);
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        this.handleStaleExtensionContext(error);
        return;
      }
      this.modelsStatusText.textContent = error instanceof Error ? error.message : "Model discovery failed.";
      this.renderModelOptions(this.currentSettings.selectedModel);
    } finally {
      this.isModelLoading = false;
      this.refreshModelsButton.disabled = this.isStaleContext;
      this.renderModelOptions(this.currentSettings?.selectedModel ?? "");
    }

    if (this.isStaleContext) {
      return;
    }
    await this.runGenerationHealthCheck();
  }

  private async runGenerationHealthCheck(): Promise<void> {
    if (this.isStaleContext) {
      return;
    }

    if (!this.currentSettings || !this.currentSettings.selectedModel) {
      this.generationHealth = { ok: false, reason: "No model selected." };
      this.statusText.textContent = "Choose a local model before generating.";
      this.setActionsDisabled(false);
      return;
    }

    this.isHealthChecking = true;
    this.statusText.textContent = "Checking generation endpoint health...";
    this.setActionsDisabled(false);

    try {
      const result = (await chrome.runtime.sendMessage({
        type: "CHECK_GENERATION_HEALTH",
        payload: {
          endpointUrl: this.currentSettings.endpointUrl,
          model: this.currentSettings.selectedModel,
        },
      } satisfies RuntimeEnvelope<"CHECK_GENERATION_HEALTH">)) as GenerationHealthResponse;

      this.generationHealth = result;

      if (result.ok) {
        this.statusText.textContent = "Pick an action to start streaming from your local model.";
        this.modelsStatusText.textContent = `Generation endpoint ready for ${this.currentSettings.selectedModel}.`;
      } else if (result.status === 403) {
        this.showForbiddenGuidance(result.reason, result.bodySnippet);
      } else {
        const details = result.reason ?? "Generation health check failed.";
        const body = result.bodySnippet ? ` Details: ${result.bodySnippet}` : "";
        this.statusText.textContent = `${details}${body}`;
        this.modelsStatusText.textContent = result.status
          ? `Health check failed with status ${result.status}.`
          : "Health check failed.";
      }
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        this.handleStaleExtensionContext(error);
        return;
      }
      const reason = error instanceof Error ? error.message : "Generation health check failed.";
      this.generationHealth = { ok: false, reason };
      this.statusText.textContent = reason;
      this.modelsStatusText.textContent = "Health check failed.";
    } finally {
      this.isHealthChecking = false;
      this.setActionsDisabled(false);
    }
  }

  private showForbiddenGuidance(reason?: string, bodySnippet?: string): void {
    const endpoint = this.currentSettings?.endpointUrl ?? "unknown endpoint";
    const model = this.currentSettings?.selectedModel ?? "unknown model";

    this.statusText.textContent = "Generation endpoint denied request (403), likely origin restriction.";
    this.modelsStatusText.textContent = "Health check failed (403).";
    this.outputText.textContent = buildForbiddenGuidance(endpoint, model, reason, bodySnippet);
  }

  private async handleModelChange(): Promise<void> {
    if (!this.currentSettings || this.isStaleContext) {
      return;
    }

    const selectedModel = this.modelSelect.value.trim();
    this.currentSettings.selectedModel = selectedModel;
    this.generationHealth = { ok: false, reason: "Generation health not checked yet." };

    try {
      await saveSettings(this.currentSettings);
      this.modelsStatusText.textContent = selectedModel ? `Using ${selectedModel}.` : "No model selected.";
      this.statusText.textContent = selectedModel
        ? "Checking generation endpoint health..."
        : "Choose a local model before generating.";
      await this.runGenerationHealthCheck();
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        this.handleStaleExtensionContext(error);
        return;
      }
      this.statusText.textContent = error instanceof Error ? error.message : "Failed to save selected model.";
      this.setActionsDisabled(false);
    }
  }

  private areActionsEnabled(): boolean {
    const hasSelectedModel = Boolean(this.currentSettings?.selectedModel);
    return !this.isStaleContext && areActionsAllowed(hasSelectedModel, this.generationHealth.ok, this.isHealthChecking);
  }

  private setActionsDisabled(disabled: boolean): void {
    const enabled = this.areActionsEnabled();
    for (const button of this.actionsWrap.querySelectorAll<HTMLButtonElement>("button")) {
      button.disabled = disabled || !enabled;
    }
  }

  private async startGeneration(actionId: string): Promise<void> {
    if (this.isStaleContext) {
      this.statusText.textContent = formatContextInvalidatedNotice();
      return;
    }

    if (!this.currentSnapshot) {
      this.showNotice("Select text first.");
      return;
    }

    const selectedModel = this.currentSettings?.selectedModel?.trim() ?? "";
    if (!selectedModel) {
      this.statusText.textContent = "Choose a local model in this popup before generating.";
      return;
    }

    if (!this.generationHealth.ok) {
      this.statusText.textContent = "Generation endpoint is not healthy yet. Click Refresh to re-check.";
      return;
    }

    const requestId = createId();
    this.currentRequestId = requestId;
    this.generatedText = "";
    this.outputText.textContent = "";
    this.statusText.textContent = "Generating with your local model...";
    this.copyButton.disabled = true;
    this.insertButton.disabled = true;
    this.stopButton.hidden = false;
    this.setActionsDisabled(true);

    const port = this.ensurePort();
    if (!port) {
      return;
    }

    try {
      port.postMessage({
        type: "START_GENERATION",
        payload: {
          requestId,
          actionId,
          model: selectedModel,
          context: this.currentSnapshot.context,
        },
      } satisfies RuntimeEnvelope<"START_GENERATION">);
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        this.handleStaleExtensionContext(error);
        return;
      }
      throw error;
    }
  }

  private abortGeneration(): void {
    if (!this.currentRequestId || !this.port) {
      return;
    }

    try {
      this.port.postMessage({
        type: "ABORT_GENERATION",
        payload: {
          requestId: this.currentRequestId,
        },
      } satisfies RuntimeEnvelope<"ABORT_GENERATION">);
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        this.handleStaleExtensionContext(error);
      }
    }
  }

  private async handleCopy(): Promise<void> {
    if (!this.generatedText) {
      return;
    }

    await copyText(this.generatedText);
    this.statusText.textContent = "Copied to clipboard.";
    this.onStatus("Copied the generated result.");
  }

  private handleInsert(): void {
    const inserted = insertPlainText(this.currentSnapshot?.insertionTarget, this.generatedText);
    this.statusText.textContent = inserted
      ? "Inserted into the editor."
      : "Insertion is no longer safe on this field. Use Copy instead.";
    this.onStatus(this.statusText.textContent);
  }

  private async handleOpenOptions(): Promise<void> {
    if (this.isStaleContext) {
      this.statusText.textContent = formatContextInvalidatedNotice();
      return;
    }

    try {
      await chrome.runtime.openOptionsPage();
    } catch {
      try {
        window.open(chrome.runtime.getURL("options.html"), "_blank", "noopener,noreferrer");
      } catch (error) {
        if (isExtensionContextInvalidatedError(error)) {
          this.handleStaleExtensionContext(error);
          return;
        }
        throw error;
      }
    }
  }

  private handleStaleExtensionContext(error?: unknown): void {
    const stale = getStaleContextUiState();
    this.isStaleContext = true;
    this.currentRequestId = null;
    this.generatedText = "";
    this.generationHealth = { ok: false, reason: stale.statusMessage };
    this.stopButton.hidden = true;
    this.copyButton.disabled = true;
    this.insertButton.disabled = true;
    this.modelSelect.disabled = stale.disableModelControls;
    this.refreshModelsButton.disabled = stale.disableModelControls;
    this.openSettingsButton.disabled = stale.disableModelControls;
    this.statusText.textContent = stale.statusMessage;
    this.modelsStatusText.textContent = stale.statusMessage;
    if (stale.clearOutput) {
      this.outputText.textContent = "Refresh this tab to reconnect the extension context.";
    }

    if (this.port) {
      try {
        this.port.disconnect();
      } catch {
        // ignore
      }
      this.port = null;
    }

    this.setActionsDisabled(stale.disableActions);
    this.onStatus(stale.statusMessage);

    if (error instanceof Error) {
      console.info("[Stellaris Local Assist] Extension context invalidated:", error.message);
    }
  }

  private closePopover(): void {
    this.abortGeneration();
    this.popover.hidden = true;
    if (this.currentSnapshot) {
      this.positionElement(this.toolbarButton, this.currentSnapshot.rect, 8, 118, 40);
      this.toolbarButton.hidden = false;
    }
  }

  private positionDetachedPopover(): void {
    this.popover.style.top = "20px";
    this.popover.style.left = `${Math.max(12, window.innerWidth - 392)}px`;
  }

  private positionElement(
    element: HTMLElement,
    rect: DOMRect,
    offset: number,
    width: number,
    height: number,
  ): void {
    const left = clamp(rect.left, 12, Math.max(12, window.innerWidth - width - 12));
    const preferredTop = rect.bottom + offset;
    const top = preferredTop + height > window.innerHeight
      ? clamp(rect.top - height - offset, 12, Math.max(12, window.innerHeight - height - 12))
      : clamp(preferredTop, 12, Math.max(12, window.innerHeight - height - 12));

    element.style.top = `${top}px`;
    element.style.left = `${left}px`;
  }
}
