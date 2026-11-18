import assert from "node:assert/strict";
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {test} from "node:test";
import {formatValue, formatReference} from "../../custom_components/lunactl/frontend/value-format.js";
import {countdownView} from "../../custom_components/lunactl/frontend/countdown.js";
import {renderPreview, previewTime} from "../../custom_components/lunactl/frontend/preview.js";
import {icons} from "../../custom_components/lunactl/frontend/icons.js";
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

// Read the very same events AND expected strings as TestCoreGolden; no copies
// of the firmware formatter cases or expected results live in the frontend.
for (const name of ["value-formatting", "value-placeholders", "value-pages", "value-subscriptions", "value-new-subscriptions",
  "countdown-parsing", "countdown-states", "countdown-lifecycle", "countdown-pages", "pie-center-countdown"]) {
  test(`shared firmware golden: ${name}`, () => {
    const {events, want} = read(`../../firmware/test/testdata/${name}.json`);
    let manifest, states = {}, now = NaN, connected = false;
    events.forEach((event, index) => {
      if (event.type === "connect") connected = true;
      if (event.type === "disconnect") connected = false;  // Disconnected keeps states.
      if (event.type === "manifest" && !want.snapshots[index].error) manifest = event.manifest;
      if (event.type === "time") now = event.valid === false ? NaN : event.timestamp ?? now;
      if (event.type === "state" && connected) {
        const entity = states[event.entity] ??= {attributes: {}};
        if (event.attribute) entity.attributes[event.attribute] = event.state;
        else entity.state = event.state;
      }
      const snapshot = want.snapshots[index];
      if (!snapshot.type || !manifest) return;  // Shown, also while Disconnected.
      const page = manifest.pages[snapshot.page];
      const pairs = page.type === "single" ? [[page.item, snapshot.item]] :
        [...page.quarters.map((item, i) => [item, snapshot.quarters[i]]), [page.center, snapshot.center]];
      for (const [item, expected] of pairs) {
        if (!item || !expected) continue;
        if (Object.hasOwn(expected, "value")) assert.equal(formatValue(item.value, states), expected.value, `${name} event ${index}`);
        if (Object.hasOwn(expected, "countdown")) assert.deepEqual(countdownView(states[item.countdown], now), expected.countdown, `${name} event ${index}`);
      }
    });
  });
}

for (const [state, digits, expected] of [["2.5", 0, "2"], ["3.5", 0, "4"], ["-0.5", 0, "0"],
  ["-3.25", 1, "-3.2"], ["0", 6, "0.000000"], ["1e21", 1, "1000000000000000000000.0"],
  [" 12", 0, "12"], ["12 ", 0, "--"], ["12\n", 0, "--"], ["1e-999", 2, "--"], ["0x1.8p1", 1, "3.0"]]) {
  test(`firmware numeric semantics ${state}/${digits}`, () => assert.equal(formatReference({decimals: digits}, state), expected));
}

test("countdown attributes reject trailing newlines", () => {
  for (const attributes of [
    {finishes_at: "2026-11-17T11:01:30Z\n", duration: "0:02:00"},
    {finishes_at: "2026-11-17T11:01:30Z", duration: "0:02:00\n"},
  ]) assert.equal(countdownView({state: "active", attributes}, 1794913200), null);
});

test("HA boolean attributes use ESPHome on/off strings for maps", () => {
  const value = {format: "{0}", refs: [{entity: "climate.room", attribute: "enabled", map: {on: "An", off: "Aus"}}]};
  for (const [enabled, expected] of [[true, "An"], [false, "Aus"]])
    assert.equal(formatValue(value, {"climate.room": {attributes: {enabled}}}), expected);
});

test("all icon names and glyphs match the firmware", () => {
  const source = readFileSync(new URL("../../esphome/lunactl/icons.h", import.meta.url), "utf8");
  const expected = Object.fromEntries([...source.matchAll(/\{"([^"]+)", "\\U([\dA-F]+)"\}/g)]
    .map(([, name, code]) => [name, String.fromCodePoint(parseInt(code, 16))]));
  assert.deepEqual(icons, expected);
});

const time = {timestamp: 1794913200, clock: "12:00"};
const item = {label: "Papa rufen", color: "#BB1260", icon: "mdi:bell-ring", action: {action: "script.example"}};
const single = {schema: 1, pages: [{type: "single", item}]};
const pie = {schema: 1, pages: [{type: "pie", quarters: [item, {...item, label: "Lesen", color: "#4378AA", icon: "mdi:book-open-variant"}, {...item, label: "Heizen", icon: "mdi:fire"}, {...item, label: "Schlafen", icon: "mdi:bed"}]}]};
const timer = {"timer.example": {state: "active", attributes: {finishes_at: "2026-11-17T11:01:30Z", duration: "0:02:00"}}};
const cases = [
  {name: "single", manifest: single},
  {name: "single-countdown", manifest: {...single, pages: [{type: "single", item: {...item, countdown: "timer.example"}}]}, states: timer},
  {name: "pie", manifest: pie},
  {name: "pie-center", manifest: {...pie, pages: [{...pie.pages[0], center: {...item, countdown: "timer.example", value: {format: "{0}", refs: [{entity: "sensor.answer"}]}}}]}, states: {...timer, "sensor.answer": {state: "Papa kommt"}}},
  {name: "empty-quarter", manifest: {...pie, pages: [{...pie.pages[0], quarters: [item, null, item, null]}]}},
  {name: "without-icon", manifest: {...single, pages: [{type: "single", item: {...item, icon: undefined}}]}},
  {name: "live-value", manifest: {...single, pages: [{type: "single", item: {...item, value: {format: "{0} °C", refs: [{entity: "sensor.room", attribute: "temperature", decimals: 1, decimal_comma: true}]}}}]}, states: {"sensor.room": {state: "on", attributes: {temperature: 21.26}}}},
  {name: "pages", manifest: {schema: 1, pages: [...single.pages, ...pie.pages]}, page: 1},
  {name: "select-single", manifest: single, editor: {selectedSlot: 0}},
  {name: "select-quarter", manifest: pie, editor: {selectedSlot: 2}},
  {name: "select-empty-center", manifest: pie, editor: {selectedSlot: 4}},
  {name: "select-center", manifest: {...pie, pages: [{...pie.pages[0], center: item}]}, editor: {selectedSlot: 4}},
  {name: "select-empty-quarter", manifest: {pages: [{type: "pie", quarters: [null, null, null, null]}]}, editor: {selectedSlot: 0}},
  {name: "select-empty-ring-quarter", manifest: {...pie, pages: [{...pie.pages[0], center: item, quarters: [null, null, null, null]}]}, editor: {selectedSlot: 1}},
];
for (const scenario of cases) {
  test(`SVG golden: ${scenario.name}`, () => {
    const before = structuredClone(scenario);
    const svg = renderPreview(scenario.manifest, scenario.states, time, scenario.page, scenario.editor);
    const url = new URL(`golden/svg/${scenario.name}.svg`, import.meta.url);
    if (process.env.UPDATE_GOLDEN === "1") { mkdirSync(new URL("golden/svg/", import.meta.url), {recursive: true}); writeFileSync(url, svg); }
    assert.equal(svg, readFileSync(url, "utf8"));
    assert.deepEqual(scenario, before);
  });
}

test("preview follows unsaved JSON, live HA states, ticks, clock and page changes", () => {
  const scenario = cases.find((c) => c.name === "live-value");
  const first = renderPreview(scenario.manifest, scenario.states, time);
  assert.match(first, /21,3 °C/);
  const edited = JSON.parse(JSON.stringify(scenario.manifest));
  edited.pages[0].item.label = "Temperatur";
  const live = {"sensor.room": {attributes: {temperature: 19.5}}};
  assert.match(renderPreview(edited, live, time), /Temperatur.*19,5 °C/);
  const countdown = cases[1];
  assert.match(renderPreview(countdown.manifest, timer, time), /1:30/);
  assert.match(renderPreview(countdown.manifest, timer, {...time, timestamp: time.timestamp + 1}), /1:29/);
  assert.doesNotMatch(renderPreview(countdown.manifest, timer, {...time, timestamp: time.timestamp + 90}), /stroke-linecap/);
  const pages = cases.find((c) => c.name === "pages").manifest;
  assert.match(renderPreview(pages, {}, time, 0), /aria-pressed="true"/);
  assert.doesNotMatch(renderPreview(pages, {}, time, 0), />12:00</);
  assert.match(renderPreview(pages, {}, {...time, clock: "12:01"}, 1), />12:01</);
  assert.deepEqual(previewTime(time.timestamp * 1000, "Europe/Berlin"), time);
});

test("partial drafts and XML injection stay inert", () => {
  for (const manifest of [undefined, {}, {pages: null}, {pages: [null]}, {pages: [{type: "pie", quarters: "bad"}]}, {pages: [{type: "single", item: {value: {}}}]},
    {pages: [{type: "single", item: {label: {toString: 1}, color: {toString: null}, icon: {toString: 1}, countdown: {toString: 1}, value: {format: "{0}", refs: [null]}}}]},
    {pages: [{type: "single", item: {value: {format: "{0}", refs: [{entity: {toString: 1}, decimals: "bad"}]}}}]}])
    assert.match(renderPreview(manifest), /^<svg/);
  const malicious = {...item, label: '<script>alert("x")</script>', color: '" onload="alert(1)', icon: '" onload="x'};
  const svg = renderPreview({pages: [{type: "single", item: malicious}]});
  assert.doesNotMatch(svg, /<script|onload=/);
  assert.match(svg, /&lt;script&gt;/);
});
