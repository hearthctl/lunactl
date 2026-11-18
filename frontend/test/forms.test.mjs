import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import {palette, iconNames, entities, actions, actionDetails, targetDomains, entityAllowed,
  withField, withEntities, otherTargets, completeAction, tryAction, parseData,
  simpleValue, fromSimple, decimalComma, prefill, mapSuggestions, setDisplay, setBinding,
  setReference, pickValueEntity, addReference, removeReference}
  from "../../custom_components/lunactl/frontend/forms.js";
import {setItem} from "../../custom_components/lunactl/frontend/manifest-operations.js";
import {ManifestEditor} from "../../custom_components/lunactl/frontend/manifest-editor.js";

const read = (name) => JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));
const states = {
  "sensor.room": {state: "23.45", attributes: {friendly_name: "Zimmer Temperatur", unit_of_measurement: "°C", display_precision: 1}},
  "timer.cooling": {state: "active", attributes: {friendly_name: "Klima-Lauf"}},
  "light.bed": {state: "off", attributes: {friendly_name: "Bett"}},
  "input_number.brightness": {state: "80", attributes: {}},
  "number.screen": {state: "40", attributes: {}},
  "select.mode": {state: "custom", attributes: {options: ["heat", "cool", "heat"]}},
};
const services = {
  light: {turn_on: {name: "Einschalten", description: "Helligkeit ändern", target: {entity: [{domain: ["light"]}]},
    fields: {brightness_pct: {description: "Helligkeit in Prozent", example: 47}}}, turn_off: {name: "Ausschalten"}},
  script: {cool: {name: "Klima aus", description: "Klimaanlage stoppen"}},
};
const ref = {entity: "sensor.room", attribute: "reading", decimals: 1, decimal_comma: true, map: {unknown: "?"}};
for (const [name, value, unit] of [
  ["bare ref", {format: "{0}", refs: [ref]}, ""],
  ["unit", {format: "{0} °C", refs: [ref]}, "°C"],
  ["unit with spaces", {format: "{0} kW / h", refs: [ref]}, "kW / h"],
  ["unit preserves spacing", {format: "{0}  °C ", refs: [ref]}, " °C "],
]) {
  test(`simple/expert lossless round trip: ${name}`, () => {
    assert.deepEqual(simpleValue(value), {ref, unit});
    assert.deepEqual(fromSimple(simpleValue(value).ref, unit), value);
  });
}
for (const [name, value] of [
  ["missing", undefined], ["null", null], ["empty", {}],
  ["two refs", {format: "{0}", refs: [ref, ref]}], ["no refs", {format: "{0}", refs: []}],
  ["null ref", {format: "{0}", refs: [null]}], ["ref array", {format: "{0}", refs: [[]]}],
  ["prefix", {format: "Temperatur: {0}", refs: [ref]}],
  ["no separator", {format: "{0}°C", refs: [ref]}], ["repeated", {format: "{0} {0}", refs: [ref]}],
  ["other placeholder", {format: "{1}", refs: [ref]}], ["literal brace", {format: "{0} {C", refs: [ref]}],
  ["newline", {format: "{0}\n°C", refs: [ref]}],
  ["final newline", {format: "{0} °C\n", refs: [ref]}], ["final carriage return", {format: "{0}\r", refs: [ref]}], ["non-string format", {format: 4, refs: [ref]}],
  ["unrepresented field", {format: "{0}", refs: [ref], extra: true}],
]) {
  test(`expert detection without rewriting: ${name}`, () => {
    const before = structuredClone(value);
    assert.equal(simpleValue(value), null);
    assert.deepEqual(value, before);
  });
}
for (const [format, language, expected] of [
  ["decimal_comma", "en", true], ["space_comma", "en", true],
  ["comma_decimal", "de", false], ["none", "de", false],
  ["language", "de", true], ["language", "en", false], [undefined, "de", true],
]) test(`HA number format: ${format}/${language}`, () => assert.equal(decimalComma({number_format: format, language}), expected));

test("entity selection prefills are editable and missing metadata stays optional", () => {
  const defaults = prefill("sensor.room", states, {number_format: "decimal_comma"});
  assert.deepEqual(defaults, {ref: {entity: "sensor.room", decimals: 1, decimal_comma: true}, unit: "°C"});
  assert.deepEqual(fromSimple({...defaults.ref, decimals: 3, decimal_comma: false, attribute: "temperature"}, "K"),
    {format: "{0} K", refs: [{entity: "sensor.room", decimals: 3, decimal_comma: false, attribute: "temperature"}]});
  assert.deepEqual(prefill("sensor.missing", states, {number_format: "none"}),
    {ref: {entity: "sensor.missing", decimal_comma: false}, unit: ""});
  for (const precision of [-1, 7, 1.5, "2", null]) {
    assert.equal(prefill("sensor.test", {"sensor.test": {attributes: {display_precision: precision}}}).ref.decimals, undefined);
  }
});

test("expert ref edits preserve format and other refs; picking replaces prefills without stale precision", () => {
  const value = {format: "T: {0} / {1}", refs: [ref, {entity: "light.bed", map: {on: "An"}}]};
  const before = structuredClone(value);
  const selected = pickValueEntity(value, 0, "timer.cooling", states, {number_format: "none"}, false);
  assert.deepEqual(selected, {format: value.format, refs: [
    {entity: "timer.cooling", attribute: "reading", decimal_comma: false, map: {unknown: "?"}}, value.refs[1],
  ]});
  assert.deepEqual(setReference(value, 1, {entity: "sensor.room"}), {format: value.format, refs: [ref, {entity: "sensor.room"}]});
  assert.deepEqual(addReference(value), {...value, refs: [...value.refs, {entity: ""}]});
  assert.deepEqual(removeReference(value, 0), {format: value.format, refs: [value.refs[1]]});
  assert.deepEqual(value, before);
});

test("map suggestions combine options, binary states and current state, allowing free entries", () => {
  assert.deepEqual(mapSuggestions({entity: "select.mode"}, states), ["heat", "cool", "custom"]);
  assert.deepEqual(mapSuggestions({entity: "light.bed"}, states), ["on", "off"]);
  assert.deepEqual(mapSuggestions({entity: "binary_sensor.door"}, {"binary_sensor.door": {state: "unavailable"}}), ["on", "off", "unavailable"]);
  assert.deepEqual(mapSuggestions({entity: "sensor.room", attribute: "unit_of_measurement"}, states), ["°C"]);
  assert.deepEqual(mapSuggestions({entity: "sensor.missing"}, states), []);
  const mapped = withField(ref, "map", Object.fromEntries([["free", "Beliebig"], ["__proto__", "Sicher"]]));
  assert.equal(mapped.map.free, "Beliebig");
  assert.equal(Object.hasOwn(mapped.map, "__proto__"), true);
});

test("own pickers search friendly names, IDs and descriptions, and filter domains", () => {
  assert.deepEqual(entities(states, "zimmer temperatur").map((e) => e.id), ["sensor.room"]);
  assert.deepEqual(entities(states, "bed").map((e) => e.name), ["Bett"]);
  assert.deepEqual(entities(states, "", ["timer"]).map((e) => e.id), ["timer.cooling"]);
  assert.deepEqual(entities(states, "", ["input_number", "number", "sensor"]).map((e) => e.id).sort(),
    ["input_number.brightness", "number.screen", "sensor.room"]);
  assert.equal(entityAllowed("sensor.missing", ["timer"]), false);
  assert.equal(entityAllowed("timer.missing", ["timer"]), true);
  assert.equal(entityAllowed("timer."), false);
  assert.deepEqual(actions(services, "HELLIGKEIT ändern").map((a) => a.id), ["light.turn_on"]);
  assert.deepEqual(actions(services, "klima").map((a) => a.id), ["script.cool"]);
  assert.deepEqual(actions(services, "light.turn_off").map((a) => a.id), ["light.turn_off"]);
  assert.deepEqual(actions(services, "no match"), []);
  assert.deepEqual(actionDetails(services, "light.turn_on").fields.brightness_pct,
    {description: "Helligkeit in Prozent", example: 47});
  assert.deepEqual(targetDomains(actionDetails(services, "light.turn_on")), ["light"]);
  assert.deepEqual(targetDomains({target: {entity: [{domain: "sensor"}, {domain: ["light", "sensor"]}]}}), ["sensor", "light"]);
  assert.deepEqual(targetDomains({target: {entity: [{domain: "light"}, {}]}}), []);
  assert.deepEqual(actionDetails(services, undefined), {});
});

test("every schema icon is in the searchable flat grid; palette is readable with white", () => {
  const schema = read("../../schema/manifest.v1.schema.json");
  assert.deepEqual(iconNames().sort(), schema.$defs.item.properties.icon.enum.toSorted());
  assert.deepEqual(iconNames("white sunny"), ["mdi:white-balance-sunny"]);
  assert.deepEqual(iconNames("no such icon"), []);
  assert.equal(palette.length, 12);
  for (const [, color] of palette) {
    assert.match(color, /^#[0-9A-F]{6}$/);
    const [r, g, b] = color.slice(1).match(/../g).map((hex) => {
      const s = parseInt(hex, 16) / 255;
      return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
    });
    assert.ok(1.05 / (.2126 * r + .7152 * g + .0722 * b + .05) >= 3, color);
  }
});

const base = {schema: 1, pages: [{type: "single", item: {label: "A", color: "#123456", action: {action: "script.old"}}}]};
for (const [name, input, field, value, expected] of [
  ["default timeout omits display", base, "timeout", 10, base],
  ["empty brightness omits display", base, "brightness", "", base],
  ["custom timeout", base, "timeout", 2.5, {...base, display: {timeout: 2.5}}],
  ["explicit default removed", {...base, display: {timeout: 10}}, "brightness", "", base],
  ["reset timeout keeps brightness", {...base, display: {timeout: 20, brightness: "sensor.room"}}, "timeout", 10,
    {...base, display: {brightness: "sensor.room"}}],
  ["remove brightness keeps timeout", {...base, display: {timeout: 20, brightness: "sensor.room"}}, "brightness", "",
    {...base, display: {timeout: 20}}],
  ["brightness entity with value 70 remains explicit", base, "brightness", "number.seventy", {...base, display: {brightness: "number.seventy"}}],
  ["clear timeout default", {...base, display: {timeout: 20}}, "timeout", undefined, base],
]) test(`display omission: ${name}`, () => {
  const before = structuredClone(input);
  assert.deepEqual(setDisplay(input, field, value), expected);
  assert.deepEqual(input, before);
});

test("form edits preserve the whole Manifest, undo/redo and device-envelope golden", async () => {
  const initial = {...structuredClone(base), pages: [base.pages[0], {type: "pie", quarters: [null, null, null, null]}]};
  const editor = new ManifestEditor({manifest: initial, revision: 1}, () => { throw Error("must not save before debounce"); },
    () => {}, {setTimeout() {}, clearTimeout() {}});
  editor.selectSlot(0);
  const binding = {action: "light.turn_on", target: {entity_id: "light.bed", device_id: ["device"], area_id: "room", floor_id: "floor", label_id: ["night"]},
    data: {brightness_pct: 40, nested: ["Kühlen", null]}};
  const changed = withEntities(binding, ["light.bed", "light.ceiling"]);
  assert.deepEqual(otherTargets(changed), {device_id: ["device"], area_id: "room", floor_id: "floor", label_id: ["night"]});
  assert.equal(Object.hasOwn(withEntities(changed, []).target, "entity_id"), false);
  const {ref: filled, unit} = prefill("sensor.room", states, {number_format: "decimal_comma"});
  editor.apply(setItem(editor.manifest, 0, 0, {...base.pages[0].item, color: "#Ab12eF", action: changed,
    value: fromSimple({...filled, map: {unknown: "?"}}, unit), countdown: "timer.cooling"}));
  for (const key of ["a_short", "a_long", "b_short", "b_long"]) editor.apply(setBinding(editor.manifest, key, changed));
  editor.apply(setDisplay(editor.manifest, "timeout", 10));
  editor.apply(setDisplay(editor.manifest, "brightness", "input_number.brightness"));
  const complete = editor.source;
  editor.undo();
  assert.equal(editor.manifest.display, undefined);
  editor.redo();
  assert.equal(editor.source, complete);
  const calls = [];
  const hass = {callService: async (...args) => calls.push(args)};
  // Invalid, unsaved Item draft still runs the current action through lunactl.
  editor.apply(setItem(editor.manifest, 0, 0, {...editor.manifest.pages[0].item, label: ""}));
  editor.status = "invalid";
  await tryAction(hass, editor.manifest.pages[0].item.action);
  for (const key of ["a_short", "a_long", "b_short", "b_long"]) await tryAction(hass, editor.manifest.buttons[key]);
  assert.deepEqual({manifest: JSON.parse(complete), calls}, read("golden/item-key-display-forms.json"));
  assert.deepEqual(initial, {...structuredClone(base), pages: [base.pages[0], {type: "pie", quarters: [null, null, null, null]}]});
  const cleared = setBinding(setBinding(base, "a_short", changed), "a_short", undefined);
  assert.deepEqual(cleared, base);
});

for (const [binding, allowed] of [[{}, false], [{action: "light."}, false], [{action: "light.turn_on\n"}, false], [{action: "x.y.z"}, false],
  [{action: "light.turn_on"}, true], [{action: "script.current", data: "{"}, true], [{action: "script.current", data: null}, true]]) {
  test(`try action only needs a complete name: ${JSON.stringify(binding)}`, async () => {
    let calls = 0;
    assert.equal(completeAction(binding), allowed);
    assert.equal(await tryAction({callService: async (domain, service, data) => {
      calls++;
      assert.equal(domain, "lunactl"); assert.equal(service, "run");
      assert.equal(data.action, binding.action);
      assert.deepEqual(JSON.parse(data.data), {target: binding.target === undefined ? {} : binding.target, data: binding.data === undefined ? {} : binding.data});
    }}, binding), allowed);
    assert.equal(calls, Number(allowed));
  });
}
test("missing target/data use empty objects and failures propagate to the form", async () => {
  await assert.rejects(tryAction({callService: async () => { throw Error("offline"); }}, {action: "script.current"}), /offline/);
  for (const [source, expected] of [["", undefined], [" ", undefined], ['{"x":[1,null]}', {x: [1, null]}],
    ["{", "{"], ["[]", []], ["null", null]]) assert.deepEqual(parseData(source), expected);
});
