import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync, writeFileSync} from "node:fs";
import {ManifestEditor} from "../../custom_components/lunactl/frontend/manifest-editor.js";
import {FIT_FONT} from "../../custom_components/lunactl/frontend/hints.js";
import {text} from "../../custom_components/lunactl/frontend/strings.js";

const elements = new Map();
globalThis.HTMLElement = class {};
globalThis.document = {createTreeWalker() {}};
globalThis.window = globalThis;
globalThis.customElements = {define(name, constructor) { elements.set(name, constructor); }};
await import("../../custom_components/lunactl/frontend/preview-element.js");
const Preview = elements.get("lunactl-preview");
const item = {label: "Wide label <&>", color: "#FFFFFF", action: {action: "script.missing", target: {entity_id: "light.missing"}},
  value: {format: "{0}", refs: [{entity: "sensor.room"}]}, countdown: "timer.missing"};
const manifest = {schema: 1, pages: [{type: "single", item}, {type: "pie", quarters: [null, item, null, null]}],
  display: {brightness: "sensor.brightness"}, buttons: {a_short: {action: "script.other"}}};
const hass = {states: {"sensor.room": {state: "unavailable"}}, services: {}};
function preview(source = manifest) {
  const element = new Preview();
  Object.assign(element, {source: JSON.stringify(source), hass, page: 0, _now: 1794913200000});
  element.willUpdate(new Map([["source", undefined]]));
  return element;
}
function flatten(template) {
  if (Array.isArray(template)) return template.map(flatten).join("");
  if (template?.strings) return template.strings.map((part, i) => part + flatten(template.values[i])).join("");
  return typeof template === "string" || typeof template === "number" ? String(template) : "";
}
const svg = (element) => element.render().values[2].values[0];

// Canvas is a browser boundary, not an estimate based on character count.
// Keep only that API mocked and exercise the actual element render hook.
test("fit adapter waits for fonts, sets Nunito 800 and refreshes on HA state and source changes", () => {
  const element = preview();
  const measured = [];
  let canvasCount = 0;
  const context = {measureText(value) {
    measured.push(value);
    assert.equal(this.font, FIT_FONT);
    return {width: value === "Wide label <&>" || value === "Wide live value" ? 241 : 20};
  }};
  document.createElement = (tag) => {
    assert.equal(tag, "canvas");
    canvasCount++;
    return {getContext(type) { assert.equal(type, "2d"); return context; }};
  };
  assert.ok(!element._hints(manifest).some((hint) => hint.kind === "text-fit"));
  assert.equal(canvasCount, 0);
  element._fontsReady = true;
  assert.equal(element._hints(manifest).filter((hint) => hint.kind === "text-fit").length, 2);
  assert.equal(canvasCount, 1);
  element.hass = {states: {"sensor.room": {state: "Wide live value"}}, services: {script: {missing: {}, other: {}}}};
  let markup = flatten(element.render());
  assert.ok(measured.includes("Wide live value"));
  assert.ok(!markup.includes("Aktion script.missing gibt es"));
  assert.ok(!markup.includes("ist gerade nicht verfügbar"));
  assert.equal(element._hints(manifest).filter((hint) => hint.kind === "text-fit").length, 4);
  element.source = JSON.stringify({pages: [{type: "single", item: {label: "Small", color: "#000000"}}]});
  assert.ok(!flatten(element.render()).includes(text.hintsNonBlocking));
  element.source = "{";
  assert.ok(!flatten(element.render()).includes(text.hintsNonBlocking));
  assert.equal(canvasCount, 1);
});

test("hint list covers other pages, keys and display; dots mark only current affected Slots", () => {
  const element = preview();
  const markup = flatten(element.render());
  for (const message of [text.hintsNonBlocking, "Seite 2 · Viertel oben rechts", "Taste A kurz", "Helligkeit", "pages[0].item.countdown"])
    assert.ok(markup.includes(message), message);
  assert.match(svg(element), /data-hint-slot="0"/);
  assert.doesNotMatch(svg(element), /data-hint-slot="1"/);
  element.page = 1;
  element.willUpdate(new Map([["page", 0]]));
  assert.match(svg(element), /data-hint-slot="1"/);
  assert.doesNotMatch(svg(element), /data-hint-slot="0"/);
  const url = new URL("golden/svg/hints.svg", import.meta.url);
  if (process.env.UPDATE_GOLDEN === "1") writeFileSync(url, svg(element));
  assert.equal(svg(element), readFileSync(url, "utf8"));
});

test("a missing target marker clears the curved quarter label", () => {
  const quarter = {label: "MMMMM", color: "#000000",
    action: {action: "light.turn_on", target: {entity_id: "light.missing"}}};
  const element = preview({schema: 1, pages: [{type: "pie", center: {label: "Center"},
    quarters: [quarter, null, null, null]}]});
  element.hass = {states: {}, services: {light: {turn_on: {}}}};
  const markup = svg(element);
  assert.match(markup, /<textPath href="#label-0" startOffset="50%">MMMMM<\/textPath>/);
  const marker = markup.match(/data-hint-slot="0"[^>]*><title>[^<]*light\.missing[^<]*<\/title><circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/);
  assert.ok(marker);
  const [, x, y, radius] = marker.map(Number);
  const markerOuterEdge = Math.hypot(x - 233, y - 233) + radius + 1;
  // Leave at least half a 28px font size between the marker and the label path.
  assert.ok(markerOuterEdge <= 200 - 14, `Marker extends to radius ${markerOuterEdge}`);
});

test("contrast markers clear straight quarter content in a centerless Pie", () => {
  const quarter = {label: "Living Room Lights", color: "#D69319"};
  const element = preview({schema: 1, pages: [{type: "pie", quarters: Array(4).fill(quarter)}]});
  const markup = svg(element);
  assert.equal([...markup.matchAll(/>Living Room Lights<\/text>/g)].length, 4);
  const markers = [...markup.matchAll(/data-hint-slot="([0-3])"[^>]*><title>[^<]+<\/title><circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)];
  assert.equal(markers.length, 4);
  for (const marker of markers) {
    const [, slot, x, y, radius] = marker.map(Number);
    const edge = radius + 1; // Include the stroke.
    // Top icons start at y=80. Bottom live values start at y=372 and use 28px text.
    assert.ok(slot < 2 ? y + edge < 80 : y - edge > 400, `Marker overlaps content rows in quarter ${slot}`);
    assert.ok(slot === 1 || slot === 2 ? x - edge > 236 : x + edge < 230, `Marker crosses the divider in quarter ${slot}`);
    assert.ok(Math.hypot(x - 233, y - 233) + edge < 233, `Marker is clipped in quarter ${slot}`);
    assert.ok(y + edge < 437, `Marker overlaps the page controls in quarter ${slot}`);
  }
});

test("all hint kinds are present while the same draft is debounced and autosaved", async () => {
  let scheduled;
  const clock = {setTimeout(fn, delay) { assert.equal(delay, 1000); scheduled = fn; return 1; }, clearTimeout() {}};
  const initial = {device_id: "room", revision: 1, manifest: {schema: 1, pages: [{type: "pie", quarters: [null, null, null, null]}]}};
  const calls = [];
  const editor = new ManifestEditor(initial, async (message) => {
    calls.push(structuredClone(message));
    return {...initial, manifest: message.manifest, revision: 2};
  }, () => {}, clock);
  const element = preview();
  element._fontsReady = true;
  element._context = {measureText() { return {width: 300}; }};
  editor.edit(JSON.stringify(manifest));
  element.source = editor.source;
  assert.deepEqual(new Set(element._hints(editor.manifest).map((hint) => hint.kind)),
    new Set(["entity-missing", "entity-unavailable", "action-missing", "contrast", "text-fit"]));
  assert.equal(editor.status, "dirty");
  flatten(element.render());
  assert.equal(calls.length, 0); // hints make no integration requests
  scheduled();
  for (let i = 0; i < 15; i++) await Promise.resolve();
  assert.equal(editor.status, "saved");
  assert.equal(editor.record.revision, 2);
  assert.deepEqual(calls.map(({type}) => type), ["lunactl/manifest/get", "lunactl/manifest/save"]);
  assert.deepEqual(calls[1].manifest, manifest);
  assert.deepEqual(editor.manifest, manifest);
  assert.ok(element._hints(editor.manifest).length > 0);
  editor.close();
});
