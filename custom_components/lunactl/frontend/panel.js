import {LitElement, html, css} from "./vendor/lit-all.min.js";
import {deviceList, deviceHeader} from "./devices.js";
import "./preview-element.js";
import {ManifestEditor} from "./manifest-editor.js";
import {text, errorText} from "./strings.js";

class LunactlDesigner extends LitElement {
  static properties = {
    hass: {attribute: false},
    narrow: {type: Boolean},
  };

  static styles = css`
    :host { display: block; height: 100%; overflow: auto;
      color: var(--primary-text-color); background: var(--primary-background-color); }
    header { display: flex; align-items: center; gap: 16px; padding: 16px;
      background: var(--app-header-background-color, var(--primary-color));
      color: var(--app-header-text-color, white); }
    h1 { font-size: 1.25rem; margin: 0; }
    main { max-width: 1000px; margin: auto; padding: 24px; }
    label { display: block; font-weight: bold; margin: 16px 0 8px; }
    select, textarea, button { font: inherit; }
    select, textarea { color: var(--primary-text-color);
      background: var(--card-background-color); border: 1px solid var(--divider-color);
      border-radius: 6px; padding: 12px; box-sizing: border-box; width: 100%; }
    .workspace { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; }
    .workspace > div { min-width: 0; }
    @media (max-width: 800px) { .workspace { grid-template-columns: 1fr; } }
    textarea { min-height: 55vh; resize: vertical; font: 14px/1.5 monospace;
      tab-size: 2; white-space: pre; }
    button { cursor: pointer; padding: 10px 14px; border-radius: 6px;
      border: 1px solid currentColor; color: var(--primary-color);
      background: var(--card-background-color); margin: 4px 8px 4px 0; }
    header button { color: inherit; background: transparent; }
    dl { display: flex; flex-wrap: wrap; gap: 8px 24px; }
    dl div { display: flex; gap: 8px; } dd { margin: 0; }
    .banner, .error { border-left: 4px solid var(--error-color); padding: 12px;
      margin: 16px 0; background: var(--card-background-color); }
    .state { padding: 8px 0; } .hint { color: var(--secondary-text-color); }
    @media (max-width: 600px) { main { padding: 16px; } }
  `;

  constructor() {
    super();
    this._devices = [];
    this._editors = new Map();
    this._selected = "";
    this._error = "";
    this._notice = "";
  }

  connectedCallback() {
    super.connectedCallback();
    this._start();
  }

  updated() { this._start(); }

  _start() {
    if (!this.isConnected || !this.hass?.user?.is_admin || this._poll) return;
    void this._refresh();
    this._poll = setInterval(() => void this._refresh(), 5000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._poll);
    this._poll = undefined;
    for (const editor of this._editors.values()) editor.close();
    this._editors.clear();
  }

  async _refresh() {
    if (this._refreshing) return;
    this._refreshing = true;
    try {
      const records = await this.hass.callWS({type: "lunactl/devices"});
      if (!this.isConnected) return;
      this._devices = deviceList(records);
      for (const record of this._devices) {
        if (this._editors.has(record.device_id)) {
          this._editors.get(record.device_id).refresh(record);
        } else {
          this._editors.set(record.device_id, new ManifestEditor(record,
            (message) => this.hass.callWS(message), () => this.requestUpdate()));
        }
      }
      for (const [id, editor] of this._editors) {
        if (!this._devices.some((device) => device.device_id === id)) {
          editor.close();
          this._editors.delete(id);
        }
      }
      if (!this._editors.has(this._selected)) this._selected = this._devices[0]?.device_id || "";
      this._error = "";
      this._loaded = true;
    } catch (error) {
      this._error = errorText(error);
    } finally {
      this._refreshing = false;
      this.requestUpdate();
    }
  }

  async _copy(editor) {
    try {
      await navigator.clipboard.writeText(editor.source);
      this._notice = text.copied;
    } catch {
      this._notice = text.copyFailed;
      this.renderRoot.querySelector("textarea")?.select();
    }
    this.requestUpdate();
  }

  render() {
    if (!this.hass?.user?.is_admin) return html`<p>${text.forbidden}</p>`;
    const editor = this._editors.get(this._selected);
    const record = editor?.record;
    const status = record && deviceHeader(record);
    return html`
      <header>
        <button aria-label=${text.menu} @click=${() => this.dispatchEvent(
          new CustomEvent("hass-toggle-menu", {bubbles: true, composed: true}))}>☰</button>
        <h1>${text.title}</h1>
      </header>
      <main>
        ${this._error ? html`<p role="alert" class="error">${this._error}</p>` : ""}
        ${!this._loaded ? html`<p>${text.loading}</p>` : ""}
        ${this._loaded && !this._devices.length ? html`<p>${text.noDevices}</p>` : ""}
        ${this._devices.length ? html`
          <label for="device">${text.device}</label>
          <select id="device" .value=${this._selected} @change=${(event) => {
            this._selected = event.target.value;
            this._notice = "";
            this.requestUpdate();
          }}>
            ${this._devices.map((device) => html`<option value=${device.device_id}
              .selected=${device.device_id === this._selected}>${device.name}</option>`)}
          </select>` : ""}
        ${editor ? html`
          <h2>${status.name}</h2>
          <dl>
            <div><dt>${text.connection}</dt><dd>${status.connection}</dd></div>
            <div><dt>${text.firmware}</dt><dd>${status.firmware}</dd></div>
            <div><dt>${text.schema}</dt><dd>${status.schema}</dd></div>
          </dl>
          ${status.requiredFirmware ? html`<p class="error">
            ${text.requiredFirmware}: ${status.requiredFirmware}</p>` : ""}
          <p class="state" role="status">${editor.saveText()}</p>
          ${editor.status === "conflict" ? html`
            <div class="banner" role="alert">
              <p>${text.conflict}</p><p>${text.conflictHelp}</p>
              <button @click=${() => editor.reload()}>${text.reload}</button>
              <button @click=${() => this._copy(editor)}>${text.copy}</button>
            </div>` : ""}
          ${editor.error ? html`<p role="alert" class="error">${editor.error}</p>` : ""}
          ${editor.status === "empty" ? html`
            <p>${text.noManifest}</p>
            <button @click=${() => editor.create()}>${text.create}</button>` : html`
            <div class="workspace"><div>
              <h3>${text.preview}</h3>
              <lunactl-preview .source=${editor.source} .hass=${this.hass} .device=${this._selected}></lunactl-preview>
            </div><div>
            <label for="manifest">${text.manifest}</label>
            <textarea id="manifest" spellcheck="false" autocapitalize="off"
              .value=${editor.source} aria-invalid=${editor.status === "invalid"}
              @input=${(event) => editor.edit(event.target.value)}></textarea>
            <p class="hint">${text.autosaveHint}</p>
            <button @click=${() => this._copy(editor)}>${text.copy}</button>
            ${editor.status === "error" ? html`
              <button @click=${() => editor.flush()}>${text.retry}</button>` : ""}
            </div></div>`}
          <p role="status">${this._notice}</p>
        ` : ""}
      </main>`;
  }
}

customElements.define("lunactl-designer", LunactlDesigner);
