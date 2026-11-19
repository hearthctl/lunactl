// Immutable Manifest operations. Slot numbers match preview.js: Single = 0,
// Dial = minus, plus, bottom left to right.
// Pie quarters = 0..3 (clockwise from top-left), Pie center = 4.
import {withField} from "./forms.js";
import {text} from "./strings.js";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export const draftItem = () => ({label: text.newItem, color: "#4378AA"});
const pageFor = (type) => type === "single" ? {type, item: draftItem()} :
  type === "dial" ? {type, value: {format: "{0}", refs: [{entity: ""}]}, minus: draftItem(), plus: draftItem(), items: [null, null, null]} :
  {type, quarters: [null, null, null, null]};

// Structural guard only: incomplete Items must stay editable as browser drafts.
// Full validation belongs to the device-schema endpoint before every save.
export function canEditManifest(manifest) {
  return object(manifest) && Array.isArray(manifest.pages) &&
    manifest.pages.length >= 1 && manifest.pages.length <= 6 &&
    manifest.pages.every((page) => object(page) && (page.type === "single" ||
      (page.type === "pie" && Array.isArray(page.quarters) && page.quarters.length === 4) ||
      (page.type === "dial" && Array.isArray(page.items) && page.items.length === 3)));
}

export function slotsFor(page) {
  return page?.type === "single" ? [0] : ["pie", "dial"].includes(page?.type) ? [0, 1, 2, 3, 4] : [];
}

export function slotItem(page, slot) {
  if (!slotsFor(page).includes(slot)) return undefined;
  return page.type === "dial" ? (slot < 2 ? page[slot === 0 ? "minus" : "plus"] : page.items[slot - 2]) :
    page.type === "single" ? page.item : slot === 4 ? page.center : page.quarters?.[slot];
}

function replacePage(manifest, index, page) {
  const pages = manifest.pages.map((entry, i) => i === index ? page : entry);
  return {...manifest, pages};
}
const validPage = (manifest, index) => canEditManifest(manifest) && Number.isInteger(index) &&
  index >= 0 && index < manifest.pages.length;
const validType = (type) => ["single", "pie", "dial"].includes(type);

export function addPage(manifest, type) {
  if (!canEditManifest(manifest) || !validType(type) || manifest.pages.length === 6) return manifest;
  return {...manifest, pages: [...manifest.pages, pageFor(type)]};
}

export function removePage(manifest, index) {
  if (!validPage(manifest, index) || manifest.pages.length === 1) return manifest;
  return {...manifest, pages: manifest.pages.filter((_, i) => i !== index)};
}

export function reorderPage(manifest, index, direction) {
  if (!validPage(manifest, index) || ![-1, 1].includes(direction) ||
      !validPage(manifest, index + direction)) return manifest;
  const pages = [...manifest.pages];
  [pages[index], pages[index + direction]] = [pages[index + direction], pages[index]];
  return {...manifest, pages};
}

// Planning is side-effect free so the caller can announce dropped Items before
// committing this Manifest. No hidden stash: only the session history recovers them.
export function switchPageType(manifest, index, type) {
  if (!validPage(manifest, index) || !validType(type) || manifest.pages[index].type === type)
    return {manifest, dropped: []};
  const old = manifest.pages[index];
  const items = (old.type === "single" ? [old.item] : old.type === "pie" ? [old.center, ...old.quarters] :
    [old.minus, old.plus, ...old.items]).filter((item) => item != null);
  const page = pageFor(type);
  if (type === "single") page.item = items[0] ?? draftItem();
  else if (type === "pie") {
    if (items[0]) page.center = items[0];
    page.quarters = [1, 2, 3, 4].map((i) => items[i] ?? null);
  } else {
    page.minus = items[0] ?? draftItem();
    page.plus = items[1] ?? draftItem();
    page.items = [2, 3, 4].map((i) => items[i] ?? null);
  }
  const result = {manifest: replacePage(manifest, index, page), dropped: items.slice(type === "single" ? 1 : 5)};
  if (old.type === "dial") result.droppedFields = ["status", "value", "caption", "countdown"].filter((field) => Object.hasOwn(old, field));
  return result;
}

export function addItem(manifest, index, slot) {
  if (!validPage(manifest, index)) return manifest;
  const page = manifest.pages[index];
  if (!slotsFor(page).includes(slot) || slotItem(page, slot) != null) return manifest;
  return setItem(manifest, index, slot, draftItem());
}

export function removeItem(manifest, index, slot) {
  if (!validPage(manifest, index)) return manifest;
  const page = manifest.pages[index];
  if (!slotsFor(page).includes(slot) || slotItem(page, slot) == null) return manifest;
  const next = {...page};
  if (page.type === "dial") {
    if (slot < 2) delete next[slot === 0 ? "minus" : "plus"];
    else next.items = page.items.map((value, i) => i === slot - 2 ? null : value);
  } else if (page.type === "single") delete next.item;
  else if (slot === 4) delete next.center;
  else next.quarters = page.quarters.map((value, i) => i === slot ? null : value);
  return replacePage(manifest, index, next);
}

// Replace just the selected Item, retaining all other pages/settings verbatim.
export function setItem(manifest, index, slot, item) {
  if (!validPage(manifest, index)) return manifest;
  const page = manifest.pages[index];
  if (!slotsFor(page).includes(slot)) return manifest;
  const next = page.type === "dial" ? (slot < 2 ? {...page, [slot === 0 ? "minus" : "plus"]: item} :
    {...page, items: page.items.map((value, i) => i === slot - 2 ? item : value)}) : page.type === "single" ? {...page, item} : slot === 4 ? {...page, center: item} :
    {...page, quarters: page.quarters.map((value, i) => i === slot ? item : value)};
  return replacePage(manifest, index, next);
}

export function setDialField(manifest, index, field, value) {
  if (!validPage(manifest, index) || manifest.pages[index].type !== "dial" ||
      !["status", "value", "caption", "countdown"].includes(field)) return manifest;
  return replacePage(manifest, index, withField(manifest.pages[index], field, value));
}
