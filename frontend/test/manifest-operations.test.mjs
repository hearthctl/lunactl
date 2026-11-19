import assert from "node:assert/strict";
import {test} from "node:test";
import {addPage, removePage, reorderPage, switchPageType, addItem, removeItem,
  draftItem, canEditManifest, slotsFor, slotItem, setItem, setDialField} from "../../custom_components/lunactl/frontend/manifest-operations.js";
import {History} from "../../custom_components/lunactl/frontend/history.js";
import {text} from "../../custom_components/lunactl/frontend/strings.js";

const a = {label: "A", color: "#4378AA", action: {action: "script.a", data: {keep: [1, null]}}};
const b = {...a, label: "B"}, c = {...a, label: "C"}, d = {...a, label: "D"};
const single = {type: "single", item: a};
const pie = {type: "pie", quarters: [a, null, b, null]};
const empty = {type: "pie", quarters: [null, null, null, null]};
const manifest = (...pages) => ({schema: 1, pages, buttons: {a_short: a.action}, display: {timeout: 20}});

// Compare entire Manifests, so operations cannot lose hidden Item fields,
// bindings, display settings, other pages or the order of non-target Slots.
const cases = [
  ["append Single draft", manifest(pie), (m) => addPage(m, "single"), manifest(pie, {type: "single", item: draftItem()})],
  ["append Pie", manifest(single), (m) => addPage(m, "pie"), manifest(single, empty)],
  ["edit Single Item", manifest(single, pie), (m) => setItem(m, 0, 0, b), manifest({type: "single", item: b}, pie)],
  ["edit quarter Item", manifest(single, pie), (m) => setItem(m, 1, 2, c), manifest(single, {...pie, quarters: [a, null, c, null]})],
  ["edit center Item", manifest({...pie, center: c}, single), (m) => setItem(m, 0, 4, b), manifest({...pie, center: b}, single)],
  ["remove first page", manifest(single, pie), (m) => removePage(m, 0), manifest(pie)],
  ["remove last page", manifest(pie, single), (m) => removePage(m, 1), manifest(pie)],
  ["keep sole page", manifest(pie), (m) => removePage(m, 0), manifest(pie)],
  ["move page right", manifest(single, pie, empty), (m) => reorderPage(m, 0, 1), manifest(pie, single, empty)],
  ["move page left", manifest(empty, pie, single), (m) => reorderPage(m, 2, -1), manifest(empty, single, pie)],
  ["first boundary", manifest(single, pie), (m) => reorderPage(m, 0, -1), manifest(single, pie)],
  ["last boundary", manifest(single, pie), (m) => reorderPage(m, 1, 1), manifest(single, pie)],
  ["Single to Pie", manifest(single, empty), (m) => switchPageType(m, 0, "pie").manifest, manifest({...empty, center: a}, empty)],
  ["empty Single to Pie", manifest({type: "single"}), (m) => switchPageType(m, 0, "pie").manifest, manifest(empty)],
  ["Pie center wins", manifest({...pie, center: c}), (m) => switchPageType(m, 0, "single").manifest, manifest({type: "single", item: c})],
  ["first occupied quarter wins", manifest({type: "pie", quarters: [null, b, a, c]}), (m) => switchPageType(m, 0, "single").manifest, manifest({type: "single", item: b})],
  ["empty Pie to Single draft", manifest(empty), (m) => switchPageType(m, 0, "single").manifest, manifest({type: "single", item: draftItem()})],
  ["add center draft", manifest(pie), (m) => addItem(m, 0, 4), manifest({...pie, center: draftItem()})],
  ["add Single draft", manifest({type: "single"}), (m) => addItem(m, 0, 0), manifest({type: "single", item: draftItem()})],
  ["do not replace occupied Slot", manifest(single), (m) => addItem(m, 0, 0), manifest(single)],
  ["remove center by omission", manifest({...pie, center: c}), (m) => removeItem(m, 0, 4), manifest(pie)],
  ["remove Single to draft", manifest(single), (m) => removeItem(m, 0, 0), manifest({type: "single"})],
  ["remove empty center unchanged", manifest(pie), (m) => removeItem(m, 0, 4), manifest(pie)],
  ["add page disabled at six", manifest(...Array(6).fill(pie)), (m) => addPage(m, "pie"), manifest(...Array(6).fill(pie))],
];
for (let slot = 0; slot < 4; slot++) {
  cases.push([`add quarter ${slot}`, manifest(empty), (m) => addItem(m, 0, slot),
    manifest({...empty, quarters: empty.quarters.map((v, i) => i === slot ? draftItem() : v)})]);
  cases.push([`remove quarter ${slot} to null`, manifest({type: "pie", quarters: [a, b, c, d]}), (m) => removeItem(m, 0, slot),
    manifest({type: "pie", quarters: [a, b, c, d].map((v, i) => i === slot ? null : v)})]);
}
for (const [name, input, operation, expected] of cases) {
  test(`Manifest operation: ${name}`, () => {
    const before = structuredClone(input);
    assert.deepEqual(operation(input), expected);
    assert.deepEqual(input, before, "operations must not mutate history or API records");
  });
}
for (const [page, type, dropped] of [
  [single, "pie", []], [pie, "single", [b]], [{...pie, center: c}, "single", [a, b]],
  [{...empty, center: c}, "single", []], [empty, "single", []],
  [{type: "pie", quarters: [a, b, c, d], center: a}, "single", [a, b, c, d]],
  [single, "single", []], [pie, "pie", []],
]) {
  test(`type switch dropped Items: ${JSON.stringify(page)} -> ${type}`, () => {
    assert.deepEqual(switchPageType(manifest(page), 0, type).dropped, dropped);
  });
}

test("invalid operation arguments leave the Manifest untouched", () => {
  const input = manifest(pie);
  for (const index of [-1, 1, 1.5, NaN]) {
    assert.equal(removePage(input, index), input);
    assert.equal(reorderPage(input, index, 1), input);
    assert.equal(switchPageType(input, index, "single").manifest, input);
    assert.equal(addItem(input, index, 0), input);
    assert.equal(removeItem(input, index, 0), input);
    assert.equal(setItem(input, index, 0, b), input);
  }
  for (const slot of [-1, 5, null, "0"]) {
    assert.equal(addItem(input, 0, slot), input);
    assert.equal(removeItem(input, 0, slot), input);
    assert.equal(setItem(input, 0, slot, b), input);
  }
  assert.equal(addPage(input, "unknown"), input);
  assert.equal(switchPageType(input, 0, "unknown").manifest, input);
  assert.equal(reorderPage(input, 0, 2), input);
  for (const invalid of [undefined, [], {}, {pages: []}, {pages: [null]}, {pages: [{type: "pie"}]}, {pages: Array(7).fill(pie)}]) {
    assert.equal(canEditManifest(invalid), false);
    assert.equal(addPage(invalid, "single"), invalid);
  }
});

test("drafts and Slot identifiers", () => {
  assert.equal(canEditManifest(manifest({type: "single"})), true);
  assert.deepEqual(slotsFor(single), [0]);
  assert.deepEqual(slotsFor(pie), [0, 1, 2, 3, 4]);
  assert.deepEqual(slotsFor(undefined), []);
  assert.equal(slotItem(single, 0), a);
  assert.equal(slotItem(pie, 2), b);
  assert.equal(slotItem({...pie, center: c}, 4), c);
  assert.equal(slotItem(single, 4), undefined);
  assert.equal(Object.hasOwn(draftItem(), "action"), false);
});

test("type switch warning states the dropped Item count before confirmation", () => {
  assert.equal(text.droppedItems(1), "1 Item wird entfernt");
  assert.equal(text.droppedItems(2), "2 Items werden entfernt");
});

for (const {name, steps, expected, undo, redo} of [
  {name: "boundaries", steps: ["undo", "redo"], expected: "a", undo: false, redo: false},
  {name: "undo/redo", steps: ["b", "c", "undo", "undo", "redo"], expected: "b", undo: true, redo: true},
  {name: "new edit discards redo", steps: ["b", "c", "undo", "d", "redo"], expected: "d", undo: true, redo: false},
  {name: "duplicate edit keeps redo", steps: ["b", "c", "undo", "b"], expected: "b", undo: true, redo: true},
  {name: "invalid draft and empty source", steps: ["{", "", "undo"], expected: "{", undo: true, redo: true},
]) {
  test(`session history: ${name}`, () => {
    const history = new History("a");
    for (const step of steps) {
      if (["undo", "redo"].includes(step)) history[step]();
      else history.push(step);
    }
    assert.equal(history.entries[history.index], expected);
    assert.equal(history.canUndo, undo);
    assert.equal(history.canRedo, redo);
  });
}

test("Dial drafts expose and edit all five Slots without losing page values", () => {
  const created = addPage(manifest(single), "dial");
  assert.equal(created.pages[1].type, "dial");
  assert.deepEqual(slotsFor(created.pages[1]), [0, 1, 2, 3, 4]);
  const dial = {type: "dial", status: {format: "Klima", refs: []}, value: {format: "20°", refs: []},
    minus: a, plus: b, items: [c, null, d]};
  for (const slot of [0, 1, 2, 3, 4]) {
    const edited = setItem(manifest(dial), 0, slot, {...a, active: {entity: "climate.room", states: ["cool"]}});
    assert.deepEqual(slotItem(edited.pages[0], slot).active, {entity: "climate.room", states: ["cool"]});
    assert.deepEqual(edited.pages[0].status, dial.status);
    const removed = removeItem(edited, 0, slot);
    assert.equal(slotItem(removed.pages[0], slot) == null, true);
    assert.equal(slotItem(addItem(removed, 0, slot).pages[0], slot).label, text.newItem);
  }
});

for (const type of ["single", "pie"]) {
  test(`Dial to ${type} maps Items and reports page-field loss`, () => {
    const page = {type: "dial", minus: a, plus: b, items: [c, null, d],
      value: {format: "20°", refs: []}, countdown: "timer.run"};
    const plan = switchPageType(manifest(page), 0, type);
    assert.deepEqual(plan.manifest.pages[0], type === "single" ? {type, item: a} :
      {type, center: a, quarters: [b, c, d, null]});
    assert.deepEqual(plan.dropped, type === "single" ? [b, c, d] : []);
    assert.deepEqual(plan.droppedFields, ["value", "countdown"]);
  });
}
test("Pie to Dial fills minus, plus and bottom Slots in order", () => {
  const plan = switchPageType(manifest({type: "pie", center: c, quarters: [a, null, b, d]}), 0, "dial");
  assert.deepEqual(plan.manifest.pages[0], {type: "dial", value: {format: "{0}", refs: [{entity: ""}]},
    minus: c, plus: a, items: [b, d, null]});
  assert.deepEqual(plan.dropped, []);
});

test("Dial field loss requires confirmation and undo restores the page", async () => {
  const {ManifestEditor} = await import("../../custom_components/lunactl/frontend/manifest-editor.js");
  const original = manifest({type: "dial", minus: a, plus: b, items: [null, null, null],
    value: {format: "20°", refs: []}});
  const editor = new ManifestEditor({manifest: original, revision: 1}, async () => ({}), () => {},
    {setTimeout() {}, clearTimeout() {}});
  editor.requestPageType("pie");
  assert.deepEqual(editor.pendingSwitch.droppedFields, ["value"]);
  assert.deepEqual(editor.manifest, original);
  editor.cancelPageType();
  assert.deepEqual(editor.manifest, original);
  editor.requestPageType("pie");
  editor.confirmPageType();
  assert.deepEqual(editor.manifest.pages[0], {type: "pie", center: a, quarters: [b, null, null, null]});
  editor.undo();
  assert.deepEqual(editor.manifest, original);
  editor.close();
});

test("Dial page fields can be set and removed without changing Items or other pages", () => {
  const original = manifest({type: "dial", minus: a, plus: b, items: [null, null, null]}, single);
  const value = {format: "20°", refs: []};
  const edited = setDialField(original, 0, "value", value);
  assert.deepEqual(edited, manifest({...original.pages[0], value}, single));
  assert.deepEqual(setDialField(edited, 0, "value", undefined), original);
});

test("AC pages retain managed settings and have no editable Slots", () => {
  const created = addPage(manifest(single), "ac");
  const page = created.pages[1];
  assert.equal(page.type, "ac");
  assert.equal(page.minutes, 30);
  assert.ok(page.id.length > 0);
  assert.deepEqual(slotsFor(page), []);
  assert.equal(setItem(created, 1, 0, a), created);
  assert.equal(switchPageType(created, 1, "dial").manifest, created);
});
