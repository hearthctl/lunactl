import {LitElement, html, css, unsafeHTML} from "./vendor/lit-all.min.js";
import {renderPreview, previewTime} from "./preview.js";
import {parseManifest} from "./manifest-editor.js";
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
  `;
  constructor() { super(); this._page = 0; this._now = Date.now(); }
  connectedCallback() {
    super.connectedCallback();
    void loadFonts().catch(() => { this._fontError = true; this.requestUpdate(); });
    this._now = Date.now();
    this._tick = setInterval(() => { this._now = Date.now(); }, 1000);
  }
  disconnectedCallback() { super.disconnectedCallback(); clearInterval(this._tick); }
  willUpdate(changed) {
    if (changed.has("device") || changed.has("page")) {
      if (Number.isInteger(this.page)) this._page = this.page;
      else if (changed.has("device")) this._page = 0;
    }
    const {manifest} = parseManifest(this.source);
    const count = Array.isArray(manifest?.pages) ? Math.min(6, manifest.pages.length) : 0;
    this._page = Math.max(0, Math.min(this._page, count - 1));
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
  render() {
    const {manifest} = parseManifest(this.source);
    const svg = renderPreview(manifest, this.hass?.states,
      previewTime(this._now, this.hass?.config?.time_zone), this._page,
      this.interactive ? {selectedSlot: this.selectedSlot} : null);
    // Only the escaped, locally generated SVG reaches unsafeHTML.
    return html`<div @click=${this._navigate} @keydown=${this._navigate}>${unsafeHTML(svg)}</div>
      <p>${text.previewApproximation}</p>
      ${this._fontError ? html`<p role="alert">${text.previewFontsFailed}</p>` : ""}`;
  }
}
customElements.define("lunactl-preview", LunactlPreview);
