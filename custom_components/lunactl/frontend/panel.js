import {LitElement, html, css, keyed} from "./vendor/lit-all.min.js";
import {deviceList, deviceHeader} from "./devices.js";
import "./preview-element.js";
import {ManifestEditor, parseManifest} from "./manifest-editor.js";
import {canEditManifest, slotItem, setItem} from "./manifest-operations.js";
import {text, errorText} from "./strings.js";
import {palette, iconNames, withField, setDisplay, setBinding, object} from "./forms.js";
import {icons} from "./icons.js";
import {formStyles} from "./form-elements.js";

class LunactlDesigner extends LitElement {
  static properties = {
    hass: {attribute: false},
    narrow: {type: Boolean},
  };

  static styles = [formStyles, css`
    :host { display: block; height: 100%; overflow: auto;
      color: var(--primary-text-color); background: var(--primary-background-color); }
    header { display: flex; align-items: center; gap: 16px; padding: 16px;
      background: var(--app-header-background-color, var(--primary-color));
      color: var(--app-header-text-color, white); }
    h1 { font-size: 1.25rem; margin: 0; }
    main { max-width: 1250px; margin: auto; padding: 24px; }
    label { display: block; font-weight: bold; margin: 16px 0 8px; }
    select, textarea, button { font: inherit; }
    select, textarea { color: var(--primary-text-color);
      background: var(--card-background-color); border: 1px solid var(--divider-color);
      border-radius: 6px; padding: 12px; box-sizing: border-box; width: 100%; }
    .workspace { display: grid; grid-template-columns: minmax(0, 466px) minmax(0, 1fr); gap: 24px; }
    .workspace > div, .card { min-width: 0; }
    .toolbar, .pages { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 16px 0; }
    .toolbar select { width: auto; }
    .toolbar label { margin: 0; }
    .card { background: var(--card-background-color); border: 1px solid var(--divider-color);
      border-radius: 12px; padding: 20px; margin-bottom: 16px; }
    .card h3 { margin-top: 0; }
    button[aria-pressed="true"] { background: var(--primary-color); color: var(--text-primary-color, white); }
    button:disabled { opacity: .45; cursor: default; }
    code { overflow-wrap: anywhere; }
    .confirmation { border: 2px solid var(--warning-color, #d69319); }
    @media (max-width: 800px) { .workspace { grid-template-columns: 1fr; } }
    textarea { resize: vertical; }
    #manifest { min-height: 55vh; font: 14px/1.5 monospace;
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
    .palette { display: flex; flex-wrap: wrap; gap: 6px; }
    .palette button { color: white; width: 36px; height: 36px; padding: 0; margin: 4px; border-radius: 50%; }
    .icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      max-height: 320px; overflow: auto; gap: 8px; padding: 4px; }
    .icons button { margin: 0; padding: 8px 4px; overflow-wrap: anywhere; }
    .glyph { display: block; font-family: "Lunactl MDI"; font-size: 28px; }
    .binding { border-top: 1px solid var(--divider-color); padding: 12px 0; }
    .binding h4 { margin: 0; }
    .card textarea { min-height: 90px; }
  `];

  constructor() {
    super();
    this._devices = [];
    this._editors = new Map();
    this._selected = "";
    this._error = "";
    this._notice = "";
    this._onKeydown = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "z") return;
      const editor = this._editors.get(this._selected);
      if (!editor || editor.status === "empty") return;
      event.preventDefault();
      if (event.shiftKey) editor.redo();
      else editor.undo();
    };
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("keydown", this._onKeydown);
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
    this.removeEventListener("keydown", this._onKeydown);
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
      editor.setView("json");
      await this.updateComplete;
      this.renderRoot.querySelector("textarea")?.select();
    }
    this.requestUpdate();
  }

  async _openJSON(editor) {
    editor.setView("json");
    await this.updateComplete;
    this.renderRoot.querySelector("textarea")?.focus();
  }

  _pages(editor) {
    const manifest = editor.manifest;
    if (!canEditManifest(manifest)) return html`<p class="hint">${text.visualUnavailable}</p>`;
    const pages = manifest.pages;
    const page = pages[editor.page];
    return html`
      <nav class="pages" aria-label=${text.preview}>
        ${pages.map((entry, i) => html`<button aria-pressed=${i === editor.page}
          @click=${() => editor.selectPage(i)}>${text.page(i + 1)} · ${text.pageTypes[entry.type]}
          ${i === 0 ? html`<strong> · ${text.start}</strong>` : ""}</button>`)}
        <button aria-label=${text.addPage} ?disabled=${pages.length === 6}
          @click=${() => { this._addingPage = !this._addingPage; this.requestUpdate(); }}>+</button>
        ${this._addingPage && pages.length < 6 ? html`
          ${["single", "pie"].map((type) => html`<button @click=${() => {
            this._addingPage = false; editor.addPage(type);
          }}>${text.pageTypes[type]}</button>`)}
          <button @click=${() => { this._addingPage = false; this.requestUpdate(); }}>${text.cancel}</button>` : ""}
      </nav>
      <div class="toolbar">
        <button aria-label=${text.previousPage} ?disabled=${editor.page === 0}
          @click=${() => editor.reorderPage(-1)}>←</button>
        <button aria-label=${text.nextPage} ?disabled=${editor.page === pages.length - 1}
          @click=${() => editor.reorderPage(1)}>→</button>
        <label for="page-type">${text.pageType}</label>
        <select id="page-type" .value=${page.type} @change=${(event) => {
          editor.requestPageType(event.target.value);
          event.target.value = page.type;
        }}>${["single", "pie"].map((type) => html`<option value=${type}
          .selected=${type === page.type}>${text.pageTypes[type]}</option>`)}</select>
        <button ?disabled=${pages.length === 1} @click=${() => editor.removePage()}>${text.removePage}</button>
      </div>
      ${editor.pendingSwitch ? html`<div role="alert" class="card confirmation">
        <p>${text.pageTypes[page.type]} → ${text.pageTypes[editor.pendingSwitch.type]}:
          <strong>${text.droppedItems(editor.pendingSwitch.dropped.length)}</strong>:
          ${editor.pendingSwitch.dropped.map((item) => typeof item?.label === "string" ? item.label : text.newItem).join(", ")}</p>
        <p>${text.undoRecovery}</p>
        <button @click=${() => editor.confirmPageType()}>${text.switchType}</button>
        <button @click=${() => editor.cancelPageType()}>${text.cancel}</button>
      </div>` : ""}`;
  }

  _slotPanel(editor) {
    const manifest = editor.manifest;
    const page = manifest?.pages?.[editor.page];
    const item = slotItem(page, editor.slot);
    const path = `pages[${editor.page}].${page?.type === "single" ? "item" :
      editor.slot === 4 ? "center" : `quarters[${editor.slot}]`}`;
    return html`<section class="card" aria-label=${text.itemForm}>
      ${editor.slot === null || !canEditManifest(manifest) ? html`<h3>${text.itemForm}</h3><p>${text.selectSlot}</p>` : html`
        <p class="hint">${text.page(editor.page + 1)} · ${text.slot(page.type, editor.slot)}</p>
        <h3>${typeof item?.label === "string" ? item.label : text.itemForm}</h3>
        ${item == null ? html`<button @click=${() => editor.addItem()}>${text.addItem}</button>
          <p class="hint">${text.draftHint}</p>` : html`
          ${this._itemForm(editor, object(item) ? item : {})}
          <button @click=${() => editor.removeItem()}>${text.removeItem}</button>`}
        <p class="hint">${text.jsonPath}: <code>${path}</code></p>
        <button @click=${() => this._openJSON(editor)}>${text.editJSON}</button>
      `}
    </section>`;
  }

  _itemForm(editor, item) {
    const change = (key, value) => editor.apply(setItem(editor.manifest, editor.page, editor.slot,
      withField(item, key, value)));
    return html`
      <label>${text.label}<textarea .value=${typeof item.label === "string" ? item.label : ""}
        @input=${(e) => change("label", e.target.value)}></textarea></label>
      <p>${text.color}</p><div class="palette">
        ${palette.map(([name, color]) => html`<button style=${`background:${color}`}
          title=${text.paletteNames[name]} aria-label=${text.paletteNames[name]}
          aria-pressed=${typeof item.color === "string" && item.color.toUpperCase() === color} @click=${() => change("color", color)}>Aa</button>`)}
      </div>
      <label>${text.customColor}<input placeholder="#RRGGBB" pattern="#[0-9A-Fa-f]{6}"
        .value=${typeof item.color === "string" ? item.color : ""} @input=${(e) => change("color", e.target.value)}></label>
      <label>${text.iconSearch}<input type="search" .value=${this._iconSearch || ""}
        @input=${(e) => { this._iconSearch = e.target.value; this.requestUpdate(); }}></label>
      ${editor.slot === 4 ? html`<p class="hint">${text.centerIcon}</p>` : ""}
      <div class="icons" aria-label=${text.icon}>
        <button aria-pressed=${item.icon === undefined} @click=${() => change("icon", undefined)}>${text.noIcon}</button>
        ${iconNames(this._iconSearch).map((name) => html`<button aria-pressed=${item.icon === name}
          @click=${() => change("icon", name)}><span class="glyph" aria-hidden="true">${icons[name]}</span>${name}</button>`)}
      </div>
      <lunactl-action-form .hass=${this.hass} .binding=${item.action}
        @form-change=${(e) => change("action", e.detail)}></lunactl-action-form>
      <lunactl-entity-picker .hass=${this.hass} .value=${item.countdown || ""} .domains=${["timer"]}
        .label=${text.countdown} @form-change=${(e) => change("countdown", e.detail || undefined)}></lunactl-entity-picker>
      <lunactl-value-form .hass=${this.hass} .value=${item.value}
        @form-change=${(e) => change("value", e.detail)}></lunactl-value-form>`;
  }

  _settings(editor) {
    const manifest = editor.manifest;
    return html`
      <section class="card"><h3>${text.buttons}</h3>
        ${Object.entries(text.buttonNames).map(([key, name]) => html`<div class="binding">
          <h4>${name}</h4><label><input type="checkbox" .checked=${manifest?.buttons?.[key] !== undefined}
            @change=${(e) => editor.apply(setBinding(editor.manifest, key, e.target.checked ? {action: ""} : undefined))}>
            ${text.action}</label>
          ${manifest?.buttons?.[key] === undefined ? html`<p>${text.unbound}</p>` : html`
            <lunactl-action-form .hass=${this.hass} .binding=${manifest.buttons[key]}
              @form-change=${(e) => editor.apply(setBinding(editor.manifest, key, e.detail))}></lunactl-action-form>`}
        </div>`)}
      </section>
      <section class="card"><h3>${text.display}</h3>
        <label>${text.timeout} (${text.seconds})<input type="number" min="0.001" max="4294967.295" step="0.001"
          .value=${String(manifest?.display?.timeout ?? 10)} @change=${({target}) => {
            if (!target.validity.badInput) {
              editor.apply(setDisplay(editor.manifest, "timeout", target.value === "" ? undefined : Number(target.value)));
            }
            target.value = String(editor.manifest?.display?.timeout ?? 10);
          }}></label>
        <lunactl-entity-picker .hass=${this.hass} .value=${manifest?.display?.brightness || ""}
          .domains=${["input_number", "number", "sensor"]} .label=${text.brightness}
          @form-change=${(e) => editor.apply(setDisplay(editor.manifest, "brightness", e.detail))}></lunactl-entity-picker>
        <p class="hint">${text.brightnessHint}</p>
      </section>`;
  }

  _workspace(editor) {
    return html`
      <div class="toolbar">
        <button aria-pressed=${editor.view === "visual"} ?disabled=${!!parseManifest(editor.source).error}
          @click=${() => editor.setView("visual")}>${text.visual}</button>
        <button aria-pressed=${editor.view === "json"} ?disabled=${!!parseManifest(editor.source).error}
          @click=${() => this._openJSON(editor)}>${text.json}</button>
        <button ?disabled=${!editor.history.canUndo} @click=${() => editor.undo()}>${text.undo}</button>
        <button ?disabled=${!editor.history.canRedo} @click=${() => editor.redo()}>${text.redo}</button>
      </div>
      ${this._pages(editor)}
      <div class="workspace"><div>
        <h3>${text.preview}</h3>
        <lunactl-preview .source=${editor.source} .hass=${this.hass} .device=${this._selected}
          .page=${editor.page} .interactive=${canEditManifest(editor.manifest)} .selectedSlot=${editor.slot}
          @page-select=${(event) => editor.selectPage(event.detail)}
          @slot-select=${(event) => editor.selectSlot(event.detail)}></lunactl-preview>
        ${editor.view === "visual" ? keyed(`${this._selected}:${editor.generation}`, this._settings(editor)) : ""}
      </div><div>
        ${editor.view === "visual" ? keyed(`${this._selected}:${editor.generation}:${editor.page}:${editor.slot}`, this._slotPanel(editor)) : html`
          <label for="manifest">${text.manifest}</label>
          <textarea id="manifest" spellcheck="false" autocapitalize="off"
            .value=${editor.source} aria-invalid=${editor.status === "invalid"}
            @input=${(event) => editor.edit(event.target.value)}></textarea>
          <button @click=${() => this._copy(editor)}>${text.copy}</button>`}
      </div></div>
      <p class="hint">${text.autosaveHint}</p>
      ${editor.status === "error" ? html`<button @click=${() => editor.flush()}>${text.retry}</button>` : ""}`;
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
            this._addingPage = false;
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
            ${this._workspace(editor)}`}
          <p role="status">${this._notice}</p>
        ` : ""}
      </main>`;
  }
}

customElements.define("lunactl-designer", LunactlDesigner);
