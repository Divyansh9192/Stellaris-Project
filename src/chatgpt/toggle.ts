export type ToggleChangeCallback = (enabled: boolean) => void;

export class ChatGptToggleUi {
  private readonly host: HTMLDivElement;
  private readonly shadowRoot: ShadowRoot;
  private readonly button: HTMLButtonElement;

  private enabled = false;
  private readonly onChange: ToggleChangeCallback;

  constructor(initialEnabled: boolean, onChange: ToggleChangeCallback) {
    this.enabled = initialEnabled;
    this.onChange = onChange;

    this.host = document.createElement("div");
    this.host.setAttribute("data-stellaris-chatgpt-toggle", "true");
    this.host.style.cssText = [
      "all: initial",
      "position: fixed",
      "bottom: 80px",
      "right: 20px",
      "z-index: 2147483647",
      "pointer-events: none",
    ].join(";");

    this.shadowRoot = this.host.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { all: initial; }

        .toggle-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          pointer-events: auto;
          border: none;
          border-radius: 999px;
          padding: 10px 16px;
          font: 600 13px/1.2 "Segoe UI", sans-serif;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(0,0,0,0.22);
          transition: background 0.2s, transform 0.1s;
          white-space: nowrap;
        }

        .toggle-btn:hover { transform: scale(1.04); }
        .toggle-btn:active { transform: scale(0.97); }

        .toggle-btn.off {
          background: #1e293b;
          color: #94a3b8;
        }

        .toggle-btn.on {
          background: linear-gradient(135deg, #0e7490, #0f766e);
          color: #f0fdfa;
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .off .dot { background: #475569; }
        .on  .dot { background: #6ee7b7; box-shadow: 0 0 6px #6ee7b7; }
      </style>
      <button class="toggle-btn off" type="button" title="Stellaris: Route ChatGPT through your local Ollama model">
        <span class="dot"></span>
        <span class="label">Local Mode: OFF</span>
      </button>
    `;

    this.button = this.shadowRoot.querySelector(".toggle-btn") as HTMLButtonElement;
    this.button.addEventListener("click", () => this.toggle());

    document.documentElement.appendChild(this.host);
    this.render();
  }

  private toggle(): void {
    this.enabled = !this.enabled;
    this.render();
    this.onChange(this.enabled);
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.render();
  }

  private render(): void {
    const label = this.shadowRoot.querySelector(".label") as HTMLSpanElement;
    label.textContent = `Local Mode: ${this.enabled ? "ON" : "OFF"}`;
    this.button.className = `toggle-btn ${this.enabled ? "on" : "off"}`;
  }

  destroy(): void {
    this.host.remove();
  }
}
