import {LitElement, html, css, unsafeHTML} from "./vendor/lit-all.min.js";
import {renderPreview, previewTime} from "./preview.js";
import {parseManifest} from "./manifest-editor.js";
import {manifestHints, textFitHints} from "./hints.js";
import {text} from "./strings.js";

let fonts;
function loadFonts() {
  // FontFace registers globally; relative URLs in shadow-root CSS are relative
  // to HA's document, not this versioned module. Resolve against import.meta.url.
  fonts ??= Promise.all([
    ["Lunactl Nunito", "nunito-800.ttf", {weight: "800"}],
    ["Lunactl MDI", "materialdesignicons-webfont.woff2", {}],
  ].map(async ([family, file, descriptors]) => {
    const font = new FontFace(family, `url("${new URL(`vendor/${file}`, import.meta.url)}")`, descriptors);
    document.fonts.add(font);
    await font.load();
  }));
  return fonts;
}

class LunactlPreview extends LitElement {
  static properties = {source: {}, hass: {attribute: false}, device: {}, page: {type: Number},
    interactive: {type: Boolean}, selectedSlot: {attribute: false}, _page: {state: true}, _now: {state: true}};
  static styles = css`
    :host { display: block; width: 100%; max-width: 466px; margin: auto; }
    svg { display: block; width: 100%; height: auto; }
    [data-page] { cursor: pointer; }
    [data-page]:focus { outline: none; }
    [data-page]:focus circle:last-child { stroke: white; stroke-width: 2; }
    [data-slot][role="button"] { cursor: pointer; }
    [data-slot][role="button"]:focus { outline: none; }
    [data-slot][data-empty="true"] > :first-child { stroke: #999; stroke-width: 2; stroke-dasharray: 8 6; }
    [data-slot][aria-pressed="true"] > :first-child,
    [data-slot][role="button"]:focus > :first-child { stroke: #80c8ff; stroke-width: 5; stroke-dasharray: none; }
    p { color: var(--secondary-text-color); }
    .hints { margin: 16px 0; padding: 16px; border: 1px solid var(--divider-color); border-radius: 12px;
      background: var(--card-background-color); }
    h3 { margin: 0 0 12px; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { border-left: 4px solid var(--warning-color, #FFB52E); padding: 8px 12px; margin: 8px 0; overflow-wrap: anywhere; }
    code { display: block; font-size: .8em; }
  `;
  constructor() { super(); this._page = 0; this._now = Date.now(); }
  connectedCallback() {
    super.connectedCallback();
    void loadFonts().then(() => { this._fontsReady = true; this.requestUpdate(); })
      .catch(() => { this._fontError = true; this.requestUpdate(); });
    this._now = Date.now();
    this._tick = setInterval(() => { this._now = Date.now(); }, 1000);
  }
  disconnectedCallback() { super.disconnectedCallback(); clearInterval(this._tick); }
  willUpdate(changed) {
    if (changed.has("device") || changed.has("page") || changed.has("source")) {
      if (Number.isInteger(this.page)) this._page = this.page;
      else if (changed.has("device")) this._page = 0;
    }
    const {manifest} = parseManifest(this.source);
    const count = Array.isArray(manifest?.pages) ? Math.min(6, manifest.pages.length) : 0;
    this._page = Math.max(0, Math.min(this._page, count - 1));
  }
  update(changed) {
    const root = this.shadowRoot;
    const focusedSlot = !changed.has("page") && !changed.has("_page") && !changed.has("device")
      ? root?.activeElement?.closest("[data-slot][role='button']")
      : null;
    super.update(changed);
    // Selection and live data updates can both replace the SVG.
    if (focusedSlot && !focusedSlot.isConnected && !root.activeElement) {
      root.querySelector(`[data-slot="${focusedSlot.dataset.slot}"][role="button"]`)?.focus({preventScroll: true});
    }
  }
  _navigate(event) {
    if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
    const target = event.target.closest?.("[data-page], [data-slot][role='button']");
    if (!target) return;
    event.preventDefault();
    if (target.hasAttribute("data-page")) {
      this._page = Number(target.dataset.page);
      this.dispatchEvent(new CustomEvent("page-select", {detail: this._page}));
    } else if (this.interactive) {
      this.dispatchEvent(new CustomEvent("slot-select", {detail: Number(target.dataset.slot)}));
    }
  }
  _hints(manifest) {
    const hints = manifestHints(manifest, this.hass?.states, this.hass?.services);
    // Canvas measures in unscaled CSS pixels, matching the SVG viewBox and
    // firmware geometry even when the preview is displayed on a narrow screen.
    // Wait for the vendored font; fallback-font widths would be misleading.
    if (this._fontsReady) {
      this._context ??= document.createElement("canvas").getContext("2d");
      if (this._context) hints.push(...textFitHints(manifest, this.hass?.states, (value, font) => {
        this._context.font = font;
        return this._context.measureText(value).width;
      }));
    }
    return hints;
  }
  _hintLocation(hint, manifest) {
    if (hint.page !== undefined)
      return `${text.page(hint.page + 1)}${hint.slot === undefined ? "" : ` · ${text.slot(manifest.pages[hint.page].type, hint.slot)}`}`;
    return hint.path.startsWith("buttons.") ? text.buttonNames[hint.path.split(".")[1]] : text.brightness;
  }
  render() {
    const {manifest} = parseManifest(this.source);
    const hints = this._hints(manifest);
    const svg = renderPreview(manifest, this.hass?.states,
      previewTime(this._now, this.hass?.config?.time_zone), this._page,
      this.interactive ? {selectedSlot: this.selectedSlot} : null, hints);
    // Only the escaped, locally generated SVG reaches unsafeHTML.
    return html`<div @click=${this._navigate} @keydown=${this._navigate}>${unsafeHTML(svg)}</div>
      <p>${text.previewApproximation}</p>
      ${hints.length ? html`<section class="hints" aria-label=${text.hints}>
        <h3>${text.hints} (${hints.length})</h3>
        <ul>${hints.map((hint) => html`<li><strong>${this._hintLocation(hint, manifest)}:</strong>
          ${text.hintMessages[hint.kind](hint)}<code>${hint.path}</code></li>`)}</ul>
        <p>${text.hintsNonBlocking}</p>
      </section>` : ""}
      ${this._fontError ? html`<p role="alert">${text.previewFontsFailed}</p>` : ""}`;
  }
}
customElements.define("lunactl-preview", LunactlPreview);
