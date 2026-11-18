// Form transformations and HA catalogues; deliberately independent of Lit/DOM.
import {icons} from "./icons.js";
import {numericState, stateText} from "./value-format.js";

export const palette = [
  ["amber", "#A66E0B"], ["orange", "#B65A1C"], ["rust", "#A63C28"],
  ["red", "#B5221C"], ["berry", "#B50C65"], ["violet", "#793F9D"],
  ["indigo", "#563286"], ["blue", "#2776A7"], ["teal", "#286D63"],
  ["green", "#2D7D2F"], ["olive", "#5D6D1F"], ["grey", "#56616D"],
];
export const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const matches = (query, ...values) => query.toLowerCase().trim().split(/\s+/)
  .every((word) => values.join(" ").toLowerCase().includes(word));
export const iconNames = (query = "") => Object.keys(icons).filter((name) => matches(query, name));
export const entityAllowed = (id, domains = []) => typeof id === "string" && id === id.trim() &&
  /^[a-z0-9_]+\.[a-z0-9_]+$/.test(id) &&
  (!domains.length || domains.includes(id.split(".")[0]));
export function entities(states = {}, query = "", domains = []) {
  return Object.entries(states).filter(([id, state]) => entityAllowed(id, domains) &&
    matches(query, id, state.attributes?.friendly_name || ""))
    .map(([id, state]) => ({id, name: state.attributes?.friendly_name || id}))
    .sort((a, b) => a.name.localeCompare(b.name));
}
export function actions(services = {}, query = "") {
  return Object.entries(services).flatMap(([domain, entries]) =>
    Object.entries(entries).map(([service, details]) => ({id: `${domain}.${service}`, ...details})))
    .filter((entry) => matches(query, entry.id, entry.name || "", entry.description || ""))
    .sort((a, b) => a.id.localeCompare(b.id));
}
export function actionDetails(services, name) {
  const [domain, service] = (typeof name === "string" ? name : "").split(".");
  return services?.[domain]?.[service] || {};
}
export function targetDomains(details) {
  const selectors = details.target?.entity;
  if (!selectors) return [];
  const entries = Array.isArray(selectors) ? selectors : [selectors];
  // A selector without a domain can accept entities from any domain.
  if (entries.some((entry) => !entry.domain)) return [];
  return [...new Set(entries.flatMap((entry) => entry.domain))];
}
export function withField(value, key, field) {
  const result = {...(object(value) ? value : {})};
  if (field === undefined) delete result[key];
  else result[key] = field;
  return result;
}
export function withEntities(binding, ids) {
  const target = withField(binding?.target, "entity_id", ids.length ? ids : undefined);
  return withField(binding, "target", Object.keys(target).length ? target : undefined);
}
export function otherTargets(binding) {
  return Object.fromEntries(Object.entries(binding?.target || {}).filter(([key]) => key !== "entity_id"));
}
export const completeAction = (binding) => typeof binding?.action === "string" &&
  binding.action === binding.action.trim() && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(binding.action);
export function deviceEnvelope(binding) {
  return {action: binding.action, data: JSON.stringify({
    target: binding.target === undefined ? {} : binding.target,
    data: binding.data === undefined ? {} : binding.data,
  })};
}
export async function tryAction(hass, binding) {
  if (!completeAction(binding)) return false;
  await hass.callService("lunactl", "run", deviceEnvelope(binding));
  return true;
}
export function parseData(source) {
  if (!source.trim()) return undefined;
  try { return JSON.parse(source); } catch { return source; }
}

// Only formats that can be represented losslessly by one ref + unit are simple.
export function simpleValue(value) {
  if (!object(value) || Object.keys(value).some((key) => !["format", "refs"].includes(key)) ||
      !Array.isArray(value.refs) || value.refs.length !== 1 || !object(value.refs[0]) ||
      typeof value.format !== "string") return null;
  const match = /^\{0\}(?: ([^{}\r\n]+))?$/.exec(value.format);
  if (!match || match[0] !== value.format) return null;
  return {ref: value.refs[0], unit: match[1] || ""};
}
export const fromSimple = (ref, unit) => ({format: `{0}${unit ? ` ${unit}` : ""}`, refs: [ref]});
export function decimalComma(locale = {}) {
  const format = locale.number_format;
  if (format === "decimal_comma" || format === "space_comma") return true;
  if (format === "decimal_dot" || format === "comma_decimal" || format === "none") return false;
  try {
    return new Intl.NumberFormat(format === "system" ? undefined : locale.language)
      .formatToParts(1.1).some((part) => part.type === "decimal" && part.value === ",");
  } catch { return false; }
}
export function prefill(entity, states, locale, attribute) {
  const attrs = states?.[entity]?.attributes || {};
  const ref = {entity};
  if (Number.isFinite(numericState(stateText(states, {entity, attribute})))) {
    ref.decimal_comma = decimalComma(locale);
    if (Number.isInteger(attrs.display_precision) && attrs.display_precision >= 0 && attrs.display_precision <= 6)
      ref.decimals = attrs.display_precision;
  }
  return {ref, unit: typeof attrs.unit_of_measurement === "string" ? attrs.unit_of_measurement : ""};
}
export function setReference(value, index, ref) {
  return {...value, refs: value.refs.map((entry, i) => i === index ? ref : entry)};
}
export function pickValueEntity(value, index, entity, states, locale, simple) {
  const previous = value.refs[index];
  const defaults = prefill(entity, states, locale, previous?.attribute);
  const ref = {...previous, ...defaults.ref};
  if (defaults.ref.decimals === undefined) delete ref.decimals;
  if (defaults.ref.decimal_comma === undefined) delete ref.decimal_comma;
  return simple ? fromSimple(ref, defaults.unit) : setReference(value, index, ref);
}
export function addReference(value) {
  return {...value, refs: [...(Array.isArray(value.refs) ? value.refs : []), {entity: ""}]};
}
export function removeReference(value, index) {
  const updated = {...value, refs: value.refs.filter((_, i) => i !== index)};
  if (updated.refs.length === value.refs.length || typeof value.format !== "string") return updated;
  updated.format = value.format.replace(/\{(0|[1-9]\d*)\}/g, (token, digits) => {
    const refIndex = Number(digits);
    if (refIndex === index) return "--";
    if (refIndex > index && refIndex < value.refs.length) return `{${refIndex - 1}}`;
    return token;
  });
  return updated;
}
export function mapSuggestions(ref, states = {}) {
  const state = states[ref?.entity];
  if (!state) return [];
  const options = Array.isArray(state.attributes?.options) ? state.attributes.options : [];
  const binary = /^(binary_sensor|input_boolean|switch|light|fan)\./.test(ref.entity) ? ["on", "off"] : [];
  const current = ref.attribute ? state.attributes?.[ref.attribute] : state.state;
  return [...new Set([...options, ...binary, current].filter((entry) => typeof entry === "string"))];
}
export function setDisplay(manifest, field, value) {
  let display = withField(manifest.display, field, value);
  if (display.timeout === 10) display = withField(display, "timeout", undefined);
  if (display.brightness === "") display = withField(display, "brightness", undefined);
  return withField(manifest, "display", Object.keys(display).length ? display : undefined);
}
export function setBinding(manifest, key, binding) {
  const buttons = withField(manifest.buttons, key, binding);
  return withField(manifest, "buttons", Object.keys(buttons).length ? buttons : undefined);
}
