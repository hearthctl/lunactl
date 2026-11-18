import {LitElement, html, css} from "./vendor/lit-all.min.js";
import {text} from "./strings.js";
import {entities, entityAllowed, actions, actionDetails, targetDomains, withField, withEntities,
  otherTargets, completeAction, tryAction, parseData, object, simpleValue, fromSimple,
  setReference, pickValueEntity, addReference, removeReference, mapSuggestions} from "./forms.js";

export const formStyles = css`
  :host { display: block; min-width: 0; }
  label { display: block; margin: 12px 0 6px; font-weight: 600; }
  input, textarea, select, button { font: inherit; box-sizing: border-box; }
  input:not([type=checkbox]), textarea, select { width: 100%; padding: 10px; border-radius: 6px;
    border: 1px solid var(--divider-color, #aaa); color: var(--primary-text-color);
    background: var(--card-background-color); }
  textarea { min-height: 90px; resize: vertical; font: 14px/1.5 monospace; }
  button { cursor: pointer; padding: 8px 10px; margin: 4px 6px 4px 0; border-radius: 6px;
    border: 1px solid var(--divider-color, #aaa); color: var(--primary-color);
    background: var(--card-background-color); }
  button:disabled { opacity: .45; cursor: default; }
  button[aria-pressed=true] { outline: 2px solid var(--primary-color); }
  .results { max-height: 220px; overflow: auto; }
  .results button { display: block; text-align: left; width: 100%; }
  small, .hint { color: var(--secondary-text-color); }
  small { display: block; }
  code, pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  fieldset { min-width: 0; border: 1px solid var(--divider-color, #aaa); border-radius: 8px; margin: 12px 0; }
  .row { display: flex; align-items: center; gap: 8px; }
  .row > label { flex: 1; min-width: 0; }
  .row input { min-width: 0; }
  .error { color: var(--error-color, #b5221c); }
`;
const send = (element, detail) => element.dispatchEvent(new CustomEvent("form-change", {detail}));
const valueText = (value) => typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);

class EntityPicker extends LitElement {
  static properties = {hass: {attribute: false}, value: {attribute: false}, domains: {attribute: false},
    multiple: {type: Boolean}, label: {}, _query: {state: true}};
  static styles = formStyles;
  constructor() { super(); this._query = null; this.domains = []; }
  willUpdate() {
    const selection = JSON.stringify(this.value);
    if (selection !== this._lastSelection) { this._query = null; this._lastSelection = selection; }
  }
  _choose(id) {
    if (id && !entityAllowed(id, this.domains)) return;
    const selected = Array.isArray(this.value) ? this.value : this.value ? [this.value] : [];
    this._query = null;
    send(this, this.multiple ? [...new Set([...selected, id])].filter(Boolean) : id);
    this.requestUpdate();
  }
  render() {
    const selected = Array.isArray(this.value) ? this.value : this.value ? [this.value] : [];
    return html`<label>${this.label || text.entity}
      <input aria-label=${this.label || text.entity} placeholder=${text.entitySearch}
        .value=${this._query ?? (this.multiple ? "" : valueText(this.value))}
        @focus=${() => { this._query = this.multiple ? "" : valueText(this.value); }}
        @input=${(e) => { this._query = e.target.value; }}
        @change=${(e) => this._choose(e.target.value.trim())}></label>
      ${this.multiple ? selected.map((id) => html`<button @click=${() =>
        send(this, selected.filter((entry) => entry !== id))}>${id} ×</button>`) :
        html`<button ?disabled=${!this.value} @click=${() => this._choose("")}>${text.clear}</button>`}
      ${this._query !== null ? html`<div class="results">
        ${entities(this.hass?.states, this._query, this.domains).filter((entry) =>
          !this.multiple || !selected.includes(entry.id)).map((entry) => html`
          <button @mousedown=${(e) => e.preventDefault()} @click=${() => this._choose(entry.id)}>${entry.name}<small>${entry.id}</small></button>`)}
        ${!entities(this.hass?.states, this._query, this.domains).length ? html`<p>${text.noMatches}</p>` : ""}
      </div>` : ""}`;
  }
}
customElements.define("lunactl-entity-picker", EntityPicker);

class ActionForm extends LitElement {
  static properties = {hass: {attribute: false}, binding: {attribute: false},
    _query: {state: true}, _notice: {state: true}, _data: {state: true}};
  static styles = formStyles;
  constructor() { super(); this._query = null; this._notice = ""; this._data = ""; }
  willUpdate() {
    const serialized = JSON.stringify(this.binding?.data);
    if (serialized !== this._lastData) {
      this._lastData = serialized;
      this._data = this.binding?.data === undefined ? "" : JSON.stringify(this.binding.data, null, 2);
    }
  }
  _change(binding) { this._notice = ""; send(this, binding); }
  async _try() {
    this._notice = "";
    try {
      if (await tryAction(this.hass, this.binding)) this._notice = text.actionSucceeded;
    } catch { this._notice = text.actionFailed; }
  }
  render() {
    const binding = object(this.binding) ? this.binding : {};
    const details = actionDetails(this.hass?.services, binding.action);
    const extra = otherTargets(binding);
    return html`<label>${text.action}
      <input aria-label=${text.actionSearch} placeholder=${text.actionSearch} .value=${valueText(binding.action)}
        @focus=${() => { this._query = ""; }}
        @input=${(e) => { this._query = e.target.value; this._change(withField(binding, "action", e.target.value)); }}></label>
      ${this._query !== null ? html`<div class="results">
        ${actions(this.hass?.services, this._query).map((entry) => html`<button @click=${() => {
          this._query = null; this._change(withField(binding, "action", entry.id));
        }}><code>${entry.id}</code> · ${entry.name || ""}<small>${entry.description || ""}</small></button>`)}
        ${!actions(this.hass?.services, this._query).length ? html`<p>${text.noMatches}</p>` : ""}
      </div>` : ""}
      <lunactl-entity-picker .hass=${this.hass} .value=${binding.target?.entity_id || []}
        .domains=${targetDomains(details)} .multiple=${true} .label=${text.target}
        @form-change=${(e) => this._change(withEntities(binding, e.detail))}></lunactl-entity-picker>
      ${Object.keys(extra).length ? html`<p class="hint">${text.otherTargets}: <code>${JSON.stringify(extra)}</code></p>` : ""}
      <label>${text.data}<textarea aria-label=${text.data} spellcheck="false" .value=${this._data}
        @input=${(e) => {
          this._data = e.target.value;
          const data = parseData(this._data);
          this._lastData = JSON.stringify(data);
          this._change(withField(binding, "data", data));
        }}></textarea></label>
      ${binding.data !== undefined && !object(binding.data) ? html`<p class="error" role="alert">${text.dataObject}</p>` : ""}
      ${Object.entries(details.fields || {}).map(([name, field]) => html`<p class="hint"><code>${name}</code>
        ${field.description || field.name || ""}
        ${field.example !== undefined ? html` · ${text.example}: <code>${valueText(field.example)}</code>` : ""}</p>`)}
      <button ?disabled=${!completeAction(binding)} @click=${() => this._try()}>${text.tryAction}</button>
      <p role="status">${this._notice}</p>`;
  }
}
customElements.define("lunactl-action-form", ActionForm);

class ValueForm extends LitElement {
  static properties = {hass: {attribute: false}, value: {attribute: false}, _mode: {state: true}};
  static styles = formStyles;
  willUpdate() {
    const source = JSON.stringify(this.value);
    if (source !== this._lastValue) {
      this._mode = simpleValue(this.value) ? "simple" : "expert";
      this._lastValue = source;
    }
  }
  _change(value) { this._lastValue = JSON.stringify(value); send(this, value); }
  _ref(index, ref) {
    this._change(setReference(this.value, index, ref));
  }
  _reference(ref, index) {
    const simple = simpleValue(this.value);
    const rows = object(ref.map) ? Object.entries(ref.map) : [];
    const map = (next) => this._ref(index, withField(ref, "map", next.length ? Object.fromEntries(next) : undefined));
    return html`<fieldset><legend>${`{${index}}`}</legend>
      <lunactl-entity-picker .hass=${this.hass} .value=${ref.entity} .label=${text.entity}
        @form-change=${(e) => this._change(pickValueEntity(this.value, index, e.detail,
          this.hass?.states, this.hass?.locale, this._mode === "simple"))}></lunactl-entity-picker>
      <label>${text.attribute}<input .value=${valueText(ref.attribute)} @input=${(e) =>
        this._ref(index, withField(ref, "attribute", e.target.value || undefined))}></label>
      ${this._mode === "simple" ? html`<label>${text.unit}<input .value=${simple?.unit ?? (typeof this.value.format === "string" ? this.value.format.slice(4) : "")}
        @input=${(e) => this._change(fromSimple(ref, e.target.value))}></label>` : ""}
      <label>${text.decimals}<select .value=${String(ref.decimals ?? "")} @change=${(e) =>
        this._ref(index, withField(ref, "decimals", e.target.value === "" ? undefined : Number(e.target.value)))}>
        <option value="" .selected=${ref.decimals === undefined}>${text.unchanged}</option>
        ${[0, 1, 2, 3, 4, 5, 6].map((n) => html`<option value=${n} .selected=${ref.decimals === n}>${n}</option>`)}
      </select></label>
      <label><input type="checkbox" .checked=${ref.decimal_comma === true} @change=${(e) =>
        this._ref(index, withField(ref, "decimal_comma", e.target.checked))}> ${text.decimalComma}</label>
      <p>${text.map}</p>
      ${rows.map(([state, display], i) => html`<div class="row">
        <input aria-label=${text.mapState} .value=${state} @change=${(e) => map(rows.map((row, j) =>
          j === i ? [e.target.value, display] : row))}>
        <span>→</span><input aria-label=${text.mapDisplay} .value=${valueText(display)} @input=${(e) =>
          map(rows.map((row, j) => j === i ? [state, e.target.value] : row))}>
        <button aria-label=${text.removeItem} @click=${() => map(rows.filter((_, j) => j !== i))}>×</button>
      </div>`)}
      <button ?disabled=${rows.some(([state]) => state === "")} @click=${() => map([...rows, ["", ""]])}>${text.addRow}</button>
      <p class="hint">${text.suggestions}:
        ${mapSuggestions(ref, this.hass?.states).filter((state) => !rows.some(([key]) => key === state))
          .map((state) => html`<button @click=${() => map([...rows, [state, state]])}>${state}</button>`)}</p>
      ${this._mode === "expert" ? html`<button @click=${() => this._change(removeReference(this.value, index))}>${text.removeItem}</button>` : ""}
    </fieldset>`;
  }
  render() {
    if (!object(this.value)) return html`<button @click=${() => { this._mode = "simple"; this._change(fromSimple({entity: ""}, "")); }}>${text.addValue}</button>`;
    const simple = simpleValue(this.value);
    return html`<h4>${text.liveValue}</h4>
      <button ?disabled=${!simple} aria-pressed=${this._mode === "simple"}
        @click=${() => { this._mode = "simple"; }}>${text.simple}</button>
      <button aria-pressed=${this._mode === "expert"} @click=${() => { this._mode = "expert"; }}>${text.expert}</button>
      ${!simple ? html`<p class="hint">${text.expertRequired}</p>` : ""}
      ${this._mode === "expert" ? html`<label>${text.format}<input .value=${valueText(this.value.format)}
        @input=${(e) => this._change({...this.value, format: e.target.value})}></label>` : ""}
      ${(Array.isArray(this.value.refs) ? this.value.refs : []).map((ref, index) =>
        this._reference(object(ref) ? ref : {}, index))}
      ${this._mode === "expert" ? html`<button @click=${() => this._change(addReference(this.value))}>${text.addRef}</button>` : ""}
      <button @click=${() => this._change(undefined)}>${text.removeItem}</button>`;
  }
}
customElements.define("lunactl-value-form", ValueForm);
