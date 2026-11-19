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
  element.willUpdate?.(new Map(Object.keys(props).map((key) => [key, undefined])));
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

test("action search keeps partial text out of the binding until submission", () => {
  const binding = {action: "light.turn_on"};
  const form = make("lunactl-action-form", {hass, binding});
  const field = input("light.turn_");
  handler(form.render(), "input")(field);
  bindings(form.render(), "@change=")[0]?.(field);
  bindings(form.render(), "@blur=")[0]?.(field);
  assert.equal(form.emitted, undefined);
  assert.equal(bindings(form.render(), ".value=")[0], "light.turn_");
  handler(form.render(), "click")();
  assert.deepEqual(form.emitted, binding);
  assert.equal(bindings(form.render(), ".value=")[0], "light.turn_on");
});

test("action form blocks Try while the action text differs from the binding", async () => {
  const calls = [];
  const binding = {action: "light.turn_on", target: {entity_id: "light.bed"}};
  const form = make("lunactl-action-form", {hass: {...hass, callService: async (...args) => calls.push(args)}, binding});
  const disabled = () => bindings(form.render(), "?disabled=").at(-1);
  const tryClick = () => bindings(form.render(), "@click=").at(-1)();
  handler(form.render(), "focus")();
  assert.equal(disabled(), false);
  handler(form.render(), "input")(input("light."));
  await tryClick();
  assert.deepEqual(calls, []);
  assert.equal(disabled(), true);
  handler(form.render(), "input")(input("light.turn_off"));
  assert.equal(disabled(), true);
  handler(form.render(), "keydown")(enter("light.turn_off"));
  await tryClick();
  assert.deepEqual(calls, []);
  form.binding = form.emitted;
  form.willUpdate(new Map([["binding", undefined]]));
  assert.equal(disabled(), false);
  await tryClick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].action, "light.turn_off");
});

test("action data survives a local render before the panel returns the edited binding", () => {
  const form = make("lunactl-action-form", {binding: {action: "notify.mobile_app_g17"}});
  for (const source of ['{\n  "message": "Luna braucht dich",\n}', '{\n  "message": "Luna braucht dich"\n}']) {
    handler(form.render(), "input", 1)(input(source));
    form.willUpdate(new Map([["_data", undefined]]));
    assert.equal(bindings(form.render(), ".value=").at(-1), source);
    const previous = form.binding;
    form.binding = form.emitted;
    form.willUpdate(new Map([["binding", previous]]));
    assert.equal(bindings(form.render(), ".value=").at(-1), source);
  }
  assert.deepEqual(form.binding.data, {message: "Luna braucht dich"});
});

test("action form runs current unsaved action and preserves JSON-only targets", async () => {
  const calls = [];
  const binding = {action: "script.old", target: {area_id: "room", entity_id: "light.bed"}, data: {old: 1}};
  const form = make("lunactl-action-form", {hass: {...hass, callService: async (...args) => calls.push(args)}, binding});
  handler(form.render(), "input")(input("light.turn_on"));
  handler(form.render(), "keydown")(enter("light.turn_on"));
  assert.equal(form.emitted.action, "light.turn_on");
  assert.deepEqual(form.emitted.target, binding.target);
  form.binding = form.emitted;
  form.willUpdate(new Map([["binding", undefined]]));
  handler(form.render(), "input", 1)(input('{ "brightness_pct": 40 }'));
  form.binding = form.emitted;
  form.willUpdate(new Map([["binding", undefined]]));
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
  form.willUpdate(new Map([["binding", undefined]]));
  assert.equal(bindings(form.render(), "?disabled=").at(-1), false, "complete name is sufficient to try");
  await form._try();
  assert.equal(JSON.parse(calls[1][2].data).data, "{");
  form.hass = {...hass, callService: async () => { throw Error("rejected"); }};
  await form._try();
  assert.equal(form._notice, text.actionFailed);
  form.binding = {action: "light."};
  form.willUpdate(new Map([["binding", undefined]]));
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

test("editing a suggested live-value map key preserves its newline", () => {
  const state = "Line 1\nLine 2";
  const states = {...hass.states, "sensor.room": {state, attributes: {}}};
  const form = make("lunactl-value-form", {hass: {...hass, states},
    value: {format: "{0}", refs: [{entity: "sensor.room"}]}});
  const suggestion = templates(form.render()).find((t) => t.values.includes(state));
  handler(suggestion, "click")();
  form.value = form.emitted;
  form.willUpdate();
  const field = templates(form.render()).find((t) => t.values.includes(text.mapState));
  assert.match(field.strings[0], /<textarea aria-label=$/);
  const [key] = bindings(field, ".value=");
  assert.equal(key, state);

  handler(field, "input")(input("Mapped"));
  form.value = form.emitted;
  form.willUpdate();
  const editedField = templates(form.render()).find((t) => t.values.includes(text.mapState));
  const renamed = key + "!";
  handler(editedField, "change")(input(renamed));
  assert.deepEqual(form.emitted.refs[0].map, {[renamed]: "Mapped"});
  assert.equal(formatValue(form.emitted, {...states, "sensor.room": {state: renamed, attributes: {}}}), "Mapped");
});

test("editing a live-value map key preserves CRLF alongside LF", () => {
  const key = "Line 1\r\nLine 2\nLine 3";
  const form = make("lunactl-value-form", {hass,
    value: {format: "{0}", refs: [{entity: "sensor.room", map: {[key]: "First\rSecond\nThird"}}]}});
  const field = templates(form.render()).find((t) => t.values.includes(text.mapState));
  handler(field, "input")(input("First\nSecond\nThird!"));
  assert.deepEqual(form.emitted.refs[0].map, {[key]: "First\rSecond\nThird!"});
  const display = form.value.refs[0].map[key];
  for (const renamed of [key + "!", "Start\n" + key, key + "\nEnd", "Line 1\r\nLine 3"]) {
    // The browser normalizes the textarea value before firing change.
    handler(field, "change")(input(renamed.replaceAll("\r\n", "\n")));
    assert.deepEqual(form.emitted.refs[0].map, {[renamed]: display});
    assert.equal(formatValue(form.emitted, {"sensor.room": {state: renamed, attributes: {}}}), display);
  }
});

test("panel Item handlers update label, palette/custom hex, optional icon and countdown", () => {
  const editor = new ManifestEditor({manifest: {schema: 1, pages: [{type: "single", item: {label: "Old\r\nLabel", color: "#123456"}}]}},
    undefined, () => {}, {setTimeout() {}, clearTimeout() {}});
  editor.selectSlot(0);
  const panel = make("lunactl-designer", {hass});
  const item = () => editor.manifest.pages[0].item;
  const render = () => panel._itemForm(editor, item());
  handler(render(), "input")(input("New\nLabel"));
  assert.equal(item().label, "New\r\nLabel");
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
  const initial = {format: "{0}\r\n°C", refs};
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
  const form = make("lunactl-value-form", {hass, value: bindings(valueForm, ".value=").at(-2)});
  const formatField = templates(form.render()).find((t) => t.values.includes(text.format));
  assert.match(formatField.strings.join(""), /<textarea\b/);
  const [format] = bindings(formatField, ".value=");
  assert.equal(format, initial.format);
  handler(formatField, "input")(input(format.replaceAll("\r\n", "\n") + "!"));
  handler(itemForm, "form-change", 2)({detail: form.emitted});
  await editor.flush();
  assert.deepEqual(requests.find((request) => request.type === "lunactl/manifest/save")
    ?.manifest.pages[0].item.value, {format: "{0}\r\n°C!", refs});
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

test("Dial page form edits live values and countdown; active form edits an Item reference", () => {
  const page = {type: "dial", value: {format: "20°", refs: []}, minus: {label: "Minus"}, plus: {}, items: [null, null, null]};
  const editor = new ManifestEditor({manifest: {schema: 1, pages: [page]}, revision: 1}, async () => ({}));
  const panel = make("lunactl-designer", {hass});
  const updated = {format: "{0}", refs: [{entity: "sensor.status"}]};
  handler(panel._dialForm(editor), "form-change")({detail: updated});
  assert.deepEqual(editor.manifest.pages[0].status, updated);
  handler(panel._dialForm(editor), "form-change", 3)({detail: "timer.cooling"});
  assert.equal(editor.manifest.pages[0].countdown, "timer.cooling");
  const form = make("lunactl-active-form", {hass, value: {entity: "climate.room", states: ["cool"]}});
  handler(form.render(), "input", 0)(input("hvac_mode"));
  assert.deepEqual(form.emitted, {entity: "climate.room", attribute: "hvac_mode", states: ["cool"]});
  handler(form.render(), "input", 1)(input("cool\nheat"));
  assert.deepEqual(form.emitted.states, ["cool", "heat"]);
  editor.close();
});

test("managed AC form edits settings instead of individual Slots", () => {
  const page = {type: "ac", id: "ac-page", entity: "climate.room", minutes: 30, minimum: 18, maximum: 26};
  const editor = new ManifestEditor({manifest: {schema: 1, pages: [page]}, revision: 1}, async () => ({}), () => {},
    {setTimeout() {}, clearTimeout() {}});
  const panel = make("lunactl-designer", {hass});
  handler(panel._slotPanel(editor), "form-change")({detail: "climate.other"});
  handler(panel._slotPanel(editor), "change")(input("60"));
  assert.deepEqual(editor.manifest.pages[0], {...page, entity: "climate.other", minutes: 60});
  assert.deepEqual(bindings(panel._slotPanel(editor), "@click="), []);
  editor.close();
});
