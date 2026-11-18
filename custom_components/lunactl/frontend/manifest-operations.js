// Immutable Manifest operations. Slot numbers match preview.js: Single = 0,
// Pie quarters = 0..3 (clockwise from top-left), Pie center = 4.
import {text} from "./strings.js";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export const draftItem = () => ({label: text.newItem, color: "#4378AA"});
const pageFor = (type) => type === "single" ? {type, item: draftItem()} :
  {type, quarters: [null, null, null, null]};

// Structural guard only: incomplete Items must stay editable as browser drafts.
// Full validation belongs to the device-schema endpoint before every save.
export function canEditManifest(manifest) {
  return object(manifest) && Array.isArray(manifest.pages) &&
    manifest.pages.length >= 1 && manifest.pages.length <= 6 &&
    manifest.pages.every((page) => object(page) && (page.type === "single" ||
      (page.type === "pie" && Array.isArray(page.quarters) && page.quarters.length === 4)));
}

export function slotsFor(page) {
  return page?.type === "single" ? [0] : page?.type === "pie" ? [0, 1, 2, 3, 4] : [];
}

export function slotItem(page, slot) {
  if (!slotsFor(page).includes(slot)) return undefined;
  return page.type === "single" ? page.item : slot === 4 ? page.center : page.quarters?.[slot];
}

function replacePage(manifest, index, page) {
  const pages = manifest.pages.map((entry, i) => i === index ? page : entry);
  return {...manifest, pages};
}
const validPage = (manifest, index) => canEditManifest(manifest) && Number.isInteger(index) &&
  index >= 0 && index < manifest.pages.length;
const validType = (type) => ["single", "pie"].includes(type);

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
  let page, dropped = [];
  if (type === "pie") {
    page = pageFor(type);
    if (old.item != null) page.center = old.item;
  } else {
    const items = [old.center, ...old.quarters].filter((item) => item != null);
    page = {type, item: items[0] ?? draftItem()};
    dropped = items.slice(1);
  }
  return {manifest: replacePage(manifest, index, page), dropped};
}

export function addItem(manifest, index, slot) {
  if (!validPage(manifest, index)) return manifest;
  const page = manifest.pages[index];
  if (!slotsFor(page).includes(slot) || slotItem(page, slot) != null) return manifest;
  const item = draftItem();
  const next = page.type === "single" ? {...page, item} : slot === 4 ? {...page, center: item} :
    {...page, quarters: page.quarters.map((value, i) => i === slot ? item : value)};
  return replacePage(manifest, index, next);
}

export function removeItem(manifest, index, slot) {
  if (!validPage(manifest, index)) return manifest;
  const page = manifest.pages[index];
  if (!slotsFor(page).includes(slot) || slotItem(page, slot) == null) return manifest;
  const next = {...page};
  if (page.type === "single") delete next.item;
  else if (slot === 4) delete next.center;
  else next.quarters = page.quarters.map((value, i) => i === slot ? null : value);
  return replacePage(manifest, index, next);
}

// Replace just the selected Item, retaining all other pages/settings verbatim.
export function setItem(manifest, index, slot, item) {
  if (!validPage(manifest, index)) return manifest;
  const page = manifest.pages[index];
  if (!slotsFor(page).includes(slot)) return manifest;
  const next = page.type === "single" ? {...page, item} : slot === 4 ? {...page, center: item} :
    {...page, quarters: page.quarters.map((value, i) => i === slot ? item : value)};
  return replacePage(manifest, index, next);
}
