import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {manifestHints, contrastAgainstWhite, textFitHints, FIT_FONT} from "../../custom_components/lunactl/frontend/hints.js";

const action = {action: "light.turn_on"};
const services = {light: {turn_on: {fields: {brightness: {required: true}}}}};
const item = {label: "Hell", color: "#000000", action};
const single = (changes) => ({schema: 1, pages: [{type: "single", item: {...item, ...changes}}]});
const location = {page: 0, slot: 0};

const references = [
  ["value ref", single({value: {format: "{0}", refs: [{entity: "sensor.room"}]}}), "sensor.room", "pages[0].item.value.refs[0].entity", location],
  ["countdown", single({countdown: "timer.run"}), "timer.run", "pages[0].item.countdown", location],
  ["scalar target", single({action: {...action, target: {entity_id: "light.bed"}}}), "light.bed", "pages[0].item.action.target.entity_id", location],
  ["list target", single({action: {...action, target: {entity_id: ["light.bed"]}}}), "light.bed", "pages[0].item.action.target.entity_id[0]", location],
  ["brightness", {...single(), display: {brightness: "sensor.brightness"}}, "sensor.brightness", "display.brightness", {}],
  ["quarter", {pages: [{type: "pie", quarters: [null, {...item, countdown: "timer.run"}, null, null]}]}, "timer.run", "pages[0].quarters[1].countdown", {page: 0, slot: 1}],
  ["center", {pages: [{type: "pie", center: {...item, countdown: "timer.run"}, quarters: [null, null, null, null]}]}, "timer.run", "pages[0].center.countdown", {page: 0, slot: 4}],
  ...["a_short", "a_long", "b_short", "b_long"].map((key) => [key, {...single(), buttons: {[key]: {...action, target: {entity_id: "light.bed"}}}}, "light.bed", `buttons.${key}.target.entity_id`, {}]),
];
for (const [name, manifest, id, path, where] of references) {
  for (const state of [undefined, "unavailable", "unknown", "off", "0"]) {
    test(`${name}: ${state ?? "missing"}`, () => {
      const states = state === undefined ? {} : {[id]: {state, attributes: {}}};
      const before = structuredClone({manifest, states, services});
      const kind = state === undefined ? "entity-missing" : state === "unavailable" ? "entity-unavailable" : null;
      assert.deepEqual(manifestHints(manifest, states, services), kind ? [{kind, path, ...where, entity: id}] : []);
      assert.deepEqual({manifest, states, services}, before);
    });
  }
}

const actions = [
  [single({action: {action: "script.run"}}), "pages[0].item.action.action", location],
  [{pages: [{type: "pie", quarters: [null, null, item, null]}]}, "pages[0].quarters[2].action.action", {page: 0, slot: 2}],
  [{pages: [{type: "pie", center: item}]}, "pages[0].center.action.action", {page: 0, slot: 4}],
  ...["a_short", "a_long", "b_short", "b_long"].map((key) => [{buttons: {[key]: action}}, `buttons.${key}.action`, {}]),
];
for (const [manifest, path, where] of actions) {
  for (const available of [false, true]) test(`action ${path}: ${available ? "available" : "missing"}`, () => {
    const name = path.includes("item") ? "script.run" : "light.turn_on";
    const [domain, service] = name.split(".");
    assert.deepEqual(manifestHints(manifest, {}, {[domain]: available ? {[service]: {}} : {other: {}}}),
      available ? [] : [{kind: "action-missing", path, ...where, action: name}]);
  });
}

for (const entity_id of ["all", "none"]) {
  test(`a Single action can target ${entity_id} without an entity warning`, () => {
    const manifest = single({action: {action: "light.turn_off", target: {entity_id}}});
    assert.deepEqual(manifestHints(manifest, {}, {light: {turn_off: {}}}), []);
  });
}

test("only specified reference fields are inspected; all refs and target entities are visited", () => {
  const manifest = single({action: {...action, data: {entity_id: "sensor.data", bogus: "value"},
    target: {entity_id: ["light.a", "light.b"], device_id: "device.missing", area_id: "room.missing"}},
    value: {format: "{0}", refs: [{entity: "sensor.a"}, {entity: "sensor.b"}]}});
  assert.deepEqual(manifestHints(manifest, {}, services).map((hint) => hint.entity),
    ["sensor.a", "sensor.b", "light.a", "light.b"]);
  assert.deepEqual(manifestHints(single({label: "W".repeat(500), action: {...action, data: {unexpected: 1}}}), {}, services), []);
});

for (const [color, ratio, hinted] of [
  ["#FFFFFF", 1, true], ["#000000", 21, false], ["#ff0000", 3.9985, false],
  ["#00FF00", 1.3722, true], ["#0000FF", 8.5925, false],
  ["#949494", 3.0335, false], ["#959595", 2.9953, true], ["#D69319", 2.6097, true],
]) test(`white text contrast ${color}: threshold 3:1`, () => {
  assert.ok(Math.abs(contrastAgainstWhite(color) - ratio) < 0.001);
  const hints = manifestHints(single({color}), {}, services);
  assert.equal(hints.length, Number(hinted));
  if (hinted) assert.deepEqual(hints[0], {kind: "contrast", path: "pages[0].item.color", ...location});
});
for (const color of [null, undefined, "", "white", "#fff", "#gggggg", {}, "#FFFFFF\n"])
  test(`invalid contrast draft ${JSON.stringify(color)}`, () => assert.equal(contrastAgainstWhite(color), null));

test("contrast is attached to the affected quarter and center", () => {
  const manifest = {pages: [{type: "pie", quarters: [null, {...item, color: "#FFFFFF"}], center: {...item, color: "#FFFFFF"}}]};
  assert.deepEqual(manifestHints(manifest, {}, services).map(({kind, page, slot}) => ({kind, page, slot})),
    [{kind: "contrast", page: 0, slot: 1}, {kind: "contrast", page: 0, slot: 4}]);
});

const fitPages = [
  ["Single", single(), 0, 240],
  ["quarter", {pages: [{type: "pie", quarters: [item]}]}, 0, 160],
  ["center", {pages: [{type: "pie", center: item}]}, 4, 240],
  ["curved quarter", {pages: [{type: "pie", quarters: [item], center: {...item, label: ""}}]}, 0, 200 * 74 * Math.PI / 180],
];
for (const [name, manifest, slot, available] of fitPages) {
  for (const delta of [-0.01, 0, 0.01]) test(`measured fit ${name} ${delta}`, () => {
    const before = structuredClone(manifest);
    const hints = textFitHints(manifest, {}, (_value, font) => {
      assert.equal(font, FIT_FONT);
      return available + delta;
    });
    assert.deepEqual(hints.map(({kind, slot: hintSlot}) => ({kind, slot: hintSlot})), delta > 0 ? [{kind: "text-fit", slot}] : []);
    assert.deepEqual(manifest, before);
  });
}

test("fit uses browser widths of explicit lines and formatted live values on every page", () => {
  const manifest = {pages: [
    ...single({label: "WW\niiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii", value: {format: "{0} °C", refs: [{entity: "sensor.room", decimals: 1, decimal_comma: true}]}}).pages,
    {type: "pie", quarters: [{...item, label: "WW"}]},
  ]};
  const measured = [];
  const measure = (value) => { measured.push(value); return value === "WW" ? 241 : 100; };
  assert.deepEqual(textFitHints(manifest, {"sensor.room": {state: "21.26"}}, measure), [
    {kind: "text-fit", path: "pages[0].item.label", page: 0, slot: 0},
    {kind: "text-fit", path: "pages[1].quarters[0].label", page: 1, slot: 0},
  ]);
  assert.ok(measured.includes("21,3 °C"));
  const live = textFitHints(single({label: "", value: {format: "{0}", refs: [{entity: "sensor.room"}]}}),
    {"sensor.room": {state: "a wide value"}}, () => 241);
  assert.deepEqual(live, [{kind: "text-fit", path: "pages[0].item.value", page: 0, slot: 0}]);
});

test("fit handles a Single label with many explicit lines", () => {
  const manifest = JSON.parse(JSON.stringify(single({label: "x\n".repeat(200000) + "wide"})));
  assert.deepEqual(textFitHints(manifest, {}, () => 8), []);
  assert.deepEqual(textFitHints(manifest, {}, (line) => line === "wide" ? 241 : 8), [
    {kind: "text-fit", path: "pages[0].item.label", ...location},
  ]);
});

test("hidden quarter values, icons, countdowns and clock do not produce fit hints", () => {
  const manifest = {pages: [{type: "pie", quarters: [{...item, label: "", value: {format: "too wide", refs: []}, countdown: "timer.run"}], center: {...item, label: ""}}]};
  assert.deepEqual(textFitHints(manifest, {}, () => { assert.fail("no visible label/value to measure"); }), []);
});

for (const draft of [undefined, null, {}, {pages: null}, {pages: [null, {}, {type: "pie", quarters: "bad", center: 7}]},
  {pages: [{type: "single", item: {value: {refs: [null, {}]}, action: {target: {entity_id: [null, {}]}}}}]},
  {buttons: "bad", display: {brightness: {}}}]) test(`partial hint draft ${JSON.stringify(draft)}`, () => {
  assert.deepEqual(manifestHints(draft, null, null), []);
  assert.deepEqual(textFitHints(draft, {}, () => NaN), []);
});

test("golden: hints for household Manifest", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../examples/child-room.json", import.meta.url), "utf8"));
  const actual = manifestHints(manifest, {}, {});
  const golden = JSON.parse(readFileSync(new URL("golden/household-hints.json", import.meta.url), "utf8"));
  assert.deepEqual(actual, golden);
});
