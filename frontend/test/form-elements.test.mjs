import assert from "node:assert/strict";
import {test} from "node:test";
import {ManifestEditor} from "../../custom_components/lunactl/frontend/manifest-editor.js";
import {formatValue} from "../../custom_components/lunactl/frontend/value-format.js";
import {text} from "../../custom_components/lunactl/frontend/strings.js";

// ADR 0005: exercise actual Lit render hooks and event handlers without a browser.
// These globals are only the interfaces read by Lit at module import time.
const elements = new Map();
globalThis.HTMLElement = class {};
globalThis.document = {createTreeWalker() {}};
globalThis.window = globalThis;
globalThis.customElements = {define(name, constructor) { elements.set(name, constructor); }};
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };
await import("../../custom_components/lunactl/frontend/panel.js");

function templates(value) {
  if (Array.isArray(value)) return value.flatMap(templates);
  if (!value?.strings) return [];
  return [value, ...value.values.flatMap(templates)];
}
function bindings(template, marker) {
  if (Array.isArray(template)) return template.flatMap((entry) => bindings(entry, marker));
  if (!template?.strings) return [];
  return template.values.flatMap((value, i) => [
    ...(template.strings[i].endsWith(marker) ? [value] : []), ...bindings(value, marker),
  ]);
}
function handler(template, event, index = 0) {
  const result = bindings(template, `@${event}=`)[index];
  assert.equal(typeof result, "function", `${event} handler ${index} exists`);
  return result;
}
function make(name, props = {}) {
  const element = new (elements.get(name))();
  Object.assign(element, props);
  element.dispatchEvent = (e) => { element.emitted = e.detail; };
  element.willUpdate?.(new Map());
  return element;
}
const input = (value) => ({target: {value}});
const enter = (value) => ({...input(value), key: "Enter", preventDefault() {}});
const hass = {locale: {number_format: "decimal_comma"}, states: {
  "sensor.room": {state: "22.5", attributes: {unit_of_measurement: "°C", display_precision: 1}},
  "timer.cooling": {state: "active", attributes: {friendly_name: "Klima-Lauf"}},
  "light.bed": {state: "on", attributes: {friendly_name: "Bett"}},
}, services: {light: {turn_on: {description: "Helligkeit ändern", fields: {
  brightness_pct: {description: "Prozent", example: 47},
}}}}};

test("leaving a partial countdown search preserves the existing binding", () => {
  const picker = make("lunactl-entity-picker", {hass, value: "timer.original", domains: ["timer"]});
  const field = input("timer.cool");
  handler(picker.render(), "input")(field);
  bindings(picker.render(), "@change=")[0]?.(field);
  bindings(picker.render(), "@blur=")[0]?.(field);
  assert.equal(picker.emitted, undefined);
  handler(picker.render(), "click", 1)();
  assert.equal(picker.emitted, "timer.cooling");
});

test("entity picker emits selected IDs and restricts countdown to timers", () => {
  const picker = make("lunactl-entity-picker", {hass, value: "", domains: ["timer"]});
  handler(picker.render(), "input")(input("Klima"));
  const results = picker.render();
  assert.deepEqual(bindings(results, "@click=").length, 2); // clear + matching timer
  handler(results, "click", 1)();
  assert.equal(picker.emitted, "timer.cooling");
  picker.emitted = undefined;
  handler(picker.render(), "keydown")(enter("sensor.room"));
  assert.equal(picker.emitted, undefined);
  handler(picker.render(), "keydown")(enter(" timer.missing "));
  assert.equal(picker.emitted, "timer.missing");
  handler(picker.render(), "click")();
  assert.equal(picker.emitted, "");
});

test("multi entity picker preserves selected targets and removes one at a time", () => {
  const picker = make("lunactl-entity-picker", {hass, value: ["light.bed"], multiple: true});
  handler(picker.render(), "keydown")(enter("light.ceiling"));
  assert.deepEqual(picker.emitted, ["light.bed", "light.ceiling"]);
  picker.value = picker.emitted;
  picker.willUpdate();
  handler(picker.render(), "click", 0)();
  assert.deepEqual(picker.emitted, ["light.ceiling"]);
});

test("entity search survives HA refreshes with an equivalent target list", () => {
  const picker = make("lunactl-entity-picker", {hass, value: ["light.bed"], multiple: true});
  handler(picker.render(), "input")(input("ceiling"));
  picker.value = ["light.bed"];
  picker.willUpdate();
  assert.equal(picker._query, "ceiling");
});

test("action form runs current unsaved action and preserves JSON-only targets", async () => {
  const calls = [];
  const binding = {action: "script.old", target: {area_id: "room", entity_id: "light.bed"}, data: {old: 1}};
  const form = make("lunactl-action-form", {hass: {...hass, callService: async (...args) => calls.push(args)}, binding});
  handler(form.render(), "input")(input("light.turn_on"));
  assert.equal(form.emitted.action, "light.turn_on");
  assert.deepEqual(form.emitted.target, binding.target);
  form.binding = form.emitted;
  form.willUpdate();
  handler(form.render(), "input", 1)(input('{ "brightness_pct": 40 }'));
  form.binding = form.emitted;
  form.willUpdate();
  assert.equal(bindings(form.render(), ".value=").at(-1), '{ "brightness_pct": 40 }', "keeps JSON whitespace while typing");
  const extra = templates(form.render()).find((t) => t.values.includes(text.otherTargets));
  assert.ok(extra, "read-only JSON target note is rendered");
  assert.ok(templates(form.render()).some((t) => t.values.includes("Prozent")));
  assert.ok(templates(form.render()).some((t) => t.values.includes("47")));
  await handler(form.render(), "click", bindings(form.render(), "@click=").length - 1)();
  assert.deepEqual(calls, [["lunactl", "run", {action: "light.turn_on", data: '{"target":{"area_id":"room","entity_id":"light.bed"},"data":{"brightness_pct":40}}'}]]);
  assert.equal(form._notice, text.actionSucceeded);
  // Malformed JSON is a schema-invalid browser draft, never stale old data.
  handler(form.render(), "input", 1)(input("{"));
  form.binding = form.emitted;
  assert.equal(form.binding.data, "{");
  form.willUpdate();
  assert.equal(bindings(form.render(), "?disabled=").at(-1), false, "complete name is sufficient to try");
  await form._try();
  assert.equal(JSON.parse(calls[1][2].data).data, "{");
  form.hass = {...hass, callService: async () => { throw Error("rejected"); }};
  await form._try();
  assert.equal(form._notice, text.actionFailed);
  form.binding = {action: "light."};
  form.willUpdate();
  assert.equal(bindings(form.render(), "?disabled=").at(-1), true);
});

test("value form chooses simple/expert on open, prefills selection, and switches losslessly", () => {
  const initial = {format: "{0}", refs: [{entity: "light.bed"}]};
  const form = make("lunactl-value-form", {hass, value: initial});
  assert.equal(form._mode, "simple");
  handler(form.render(), "form-change")({detail: "sensor.room"});
  assert.deepEqual(form.emitted, {format: "{0} °C", refs: [{entity: "sensor.room", decimals: 1, decimal_comma: true}]});
  form.value = form.emitted;
  form.willUpdate();
  // The first two buttons select simple/expert; switching modes emits no edit.
  form.emitted = undefined;
  handler(form.render(), "click", 1)();
  assert.equal(form._mode, "expert");
  assert.equal(form.emitted, undefined);
  handler(form.render(), "click", 0)();
  assert.equal(form._mode, "simple");
  form.value = {format: "T: {0} / {1}", refs: [{entity: "sensor.room"}, {entity: "light.bed"}]};
  form.willUpdate();
  assert.equal(form._mode, "expert");
  assert.equal(bindings(form.render(), "?disabled=")[0], true, "no lossy simple conversion");
});

test("value form preserves a binary sensor state with decimal-comma formatting", () => {
  const states = {...hass.states, "binary_sensor.door": {state: "on", attributes: {}}};
  const initial = {format: "{0}", refs: [{entity: "sensor.room", decimals: 1, decimal_comma: true}]};
  const form = make("lunactl-value-form", {hass: {...hass, states}, value: initial});
  handler(form.render(), "form-change")({detail: "binary_sensor.door"});
  assert.equal(formatValue(form.emitted, states), "on");
  assert.deepEqual(form.emitted, {format: "{0}", refs: [{entity: "binary_sensor.door"}]});
});

test("value form map rows accept free states, edits, suggestions and removal", () => {
  const form = make("lunactl-value-form", {hass, value: {format: "{0}", refs: [{entity: "light.bed", map: {free: "Beliebig"}}]}});
  const update = () => { form.value = form.emitted; form.willUpdate(); };
  // attribute and unit are the first input handlers; map display follows.
  handler(form.render(), "input", 2)(input("Frei")); update();
  assert.deepEqual(form.value.refs[0].map, {free: "Frei"});
  // decimals select, decimal-comma checkbox, then map state.
  handler(form.render(), "change", 2)(input("custom")); update();
  assert.deepEqual(form.value.refs[0].map, {custom: "Frei"});
  handler(form.render(), "click", 4)(); update(); // suggestion "on"
  assert.deepEqual(form.value.refs[0].map, {custom: "Frei", on: "on"});
  const rename = handler(form.render(), "change", 2);
  const collision = input("on");
  form.emitted = undefined;
  rename(collision);
  assert.equal(form.emitted, undefined, "duplicate state names must not emit an update");
  assert.equal(collision.target.value, "custom");
  rename(input("unique")); update();
  assert.deepEqual(form.value.refs[0].map, {unique: "Frei", on: "on"});
  handler(form.render(), "click", 2)(); update(); // remove first row
  assert.deepEqual(form.value.refs[0].map, {on: "on"});
});

test("panel Item handlers update label, palette/custom hex, optional icon and countdown", () => {
  const editor = new ManifestEditor({manifest: {schema: 1, pages: [{type: "single", item: {label: "Old", color: "#123456"}}]}},
    undefined, () => {}, {setTimeout() {}, clearTimeout() {}});
  editor.selectSlot(0);
  const panel = make("lunactl-designer", {hass});
  const item = () => editor.manifest.pages[0].item;
  const render = () => panel._itemForm(editor, item());
  handler(render(), "input")(input("Neu"));
  assert.equal(item().label, "Neu");
  handler(render(), "click", 0)();
  assert.equal(item().color, "#A66E0B");
  handler(render(), "input", 1)(input("#aBcDeF"));
  assert.equal(item().color, "#aBcDeF");
  handler(render(), "click", 13)();
  assert.equal(item().icon, "mdi:lightbulb");
  handler(render(), "click", 12)();
  assert.equal(Object.hasOwn(item(), "icon"), false);
  handler(render(), "form-change", 1)({detail: "timer.cooling"});
  assert.equal(item().countdown, "timer.cooling");
  handler(render(), "form-change", 1)({detail: ""});
  assert.equal(Object.hasOwn(item(), "countdown"), false);
  editor.undo();
  assert.equal(item().countdown, "timer.cooling");
});

test("editing an Expert live-value format preserves its newline in autosave", async () => {
  const refs = [{entity: "sensor.room"}];
  const initial = {format: "{0}\n°C", refs};
  const manifest = {schema: 1, pages: [{type: "single", item: {value: initial}}]};
  const requests = [];
  const editor = new ManifestEditor({manifest}, async (request) => {
    requests.push(request);
    return {manifest: request.manifest};
  }, () => {}, {setTimeout() {}, clearTimeout() {}});
  editor.edit(JSON.stringify(manifest));
  editor.selectSlot(0);
  const panel = make("lunactl-designer", {hass});
  const itemForm = panel._itemForm(editor, editor.manifest.pages[0].item);
  const valueForm = templates(itemForm).find((t) => t.strings.join("").includes("<lunactl-value-form"));
  const form = make("lunactl-value-form", {hass, value: bindings(valueForm, ".value=").at(-1)});
  const formatField = templates(form.render()).find((t) => t.values.includes(text.format));
  assert.match(formatField.strings.join(""), /<textarea\b/);
  const [format] = bindings(formatField, ".value=");
  assert.equal(format, initial.format);
  handler(formatField, "input")(input(format + "!"));
  handler(itemForm, "form-change", 2)({detail: form.emitted});
  await editor.flush();
  assert.deepEqual(requests.find((request) => request.type === "lunactl/manifest/save")
    ?.manifest.pages[0].item.value, {format: "{0}\n°C!", refs});
});

test("panel wires all four key pickers and only stores non-default display fields", () => {
  const editor = new ManifestEditor({manifest: {schema: 1, pages: [{type: "pie", quarters: [null, null, null, null]}]}},
    undefined, () => {}, {setTimeout() {}, clearTimeout() {}});
  const panel = make("lunactl-designer", {hass});
  const render = () => panel._settings(editor);
  assert.equal(bindings(render(), ".value=").at(-2), "10");
  const brightness = templates(render()).find((t) => t.strings.join("").includes(".domains="));
  assert.deepEqual(bindings(brightness, ".domains=")[0], ["input_number", "number", "sensor"]);
  for (const [i, key] of ["a_short", "a_long", "b_short", "b_long"].entries()) {
    handler(render(), "change", i)({target: {checked: true}});
    assert.deepEqual(editor.manifest.buttons[key], {action: ""});
    handler(render(), "form-change", i)({detail: {action: `script.${key}`}});
    assert.equal(editor.manifest.buttons[key].action, `script.${key}`);
  }
  handler(render(), "change", 4)({target: {value: "12.5", validity: {badInput: false}}});
  assert.deepEqual(editor.manifest.display, {timeout: 12.5});
  handler(render(), "change", 4)({target: {value: "10", validity: {badInput: false}}});
  assert.equal(Object.hasOwn(editor.manifest, "display"), false);
  handler(render(), "form-change", 4)({detail: "sensor.room"});
  assert.deepEqual(editor.manifest.display, {brightness: "sensor.room"});
  handler(render(), "form-change", 4)({detail: ""});
  assert.equal(Object.hasOwn(editor.manifest, "display"), false);
  for (let i = 0; i < 4; i++) handler(render(), "change", i)({target: {checked: false}});
  assert.equal(Object.hasOwn(editor.manifest, "buttons"), false);
});

test("panel preserves the display timeout draft until the input commits", () => {
  const editor = new ManifestEditor({manifest: {schema: 1, display: {timeout: 25},
    pages: [{type: "pie", quarters: [null, null, null, null]}]}},
    undefined, () => {}, {setTimeout() {}, clearTimeout() {}});
  const panel = make("lunactl-designer", {hass});
  const timeout = () => templates(panel._settings(editor)).find((t) => t.values.includes(text.timeout));
  const field = {value: "", validity: {badInput: false}};
  for (const onInput of bindings(timeout(), "@input=")) onInput({target: field});
  assert.equal(editor.manifest.display.timeout, 25);
  assert.equal(bindings(timeout(), ".value=")[0], "25", "the Lit binding stays unchanged during editing");
  field.value = "12.5";
  for (const onInput of bindings(timeout(), "@input=")) onInput({target: field});
  assert.equal(editor.manifest.display.timeout, 25);
  handler(timeout(), "change", 4)({target: field});
  assert.equal(editor.manifest.display.timeout, 12.5);
  field.value = "";
  field.validity.badInput = true;
  handler(timeout(), "change", 4)({target: field});
  assert.equal(editor.manifest.display.timeout, 12.5);
  assert.equal(field.value, "12.5");
  field.value = "";
  field.validity.badInput = false;
  handler(timeout(), "change", 4)({target: field});
  assert.equal(editor.manifest.display, undefined);
  assert.equal(field.value, "10");
});
