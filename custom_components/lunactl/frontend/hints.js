import {formatValue} from "./value-format.js";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const entries = (value) => object(value) ? Object.entries(value) : [];
const items = (manifest) => (Array.isArray(manifest?.pages) ? manifest.pages : []).flatMap((page, index) => {
  const slots = page?.type === "single" ? [[0, "item", page.item]] : page?.type === "pie" ? [
    ...(Array.isArray(page.quarters) ? page.quarters.map((item, slot) => [slot, `quarters[${slot}]`, item]) : []),
    [4, "center", page.center],
  ] : page?.type === "dial" ? [[0, "minus", page.minus], [1, "plus", page.plus],
    ...(Array.isArray(page.items) ? page.items.map((item, i) => [i + 2, `items[${i}]`, item]) : [])] : [];
  return slots.filter(([, , item]) => object(item)).map(([slot, field, item]) => ({
    item, page: index, slot, path: `pages[${index}].${field}`,
  }));
});

// WCAG relative luminance, sRGB channels linearized before comparing with white.
export function contrastAgainstWhite(color) {
  if (typeof color !== "string" || !/^#[\da-f]{6}$/i.test(color)) return null;
  const channels = color.slice(1).match(/../g).map((hex) => {
    const channel = parseInt(hex, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 + 0.05);
}

// Advisory only: partial drafts are tolerated; action data and non-entity targets
// are deliberately opaque. No validation, integration requests or draft mutation.
export function manifestHints(manifest, states = {}, services = {}) {
  const hints = [];
  const entity = (id, path, location = {}) => {
    if (typeof id !== "string" || !id) return;
    if (!Object.hasOwn(states ?? {}, id)) hints.push({kind: "entity-missing", path, ...location, entity: id});
    else if (states[id]?.state === "unavailable") hints.push({kind: "entity-unavailable", path, ...location, entity: id});
  };
  const action = (binding, path, location) => {
    if (!object(binding)) return;
    if (typeof binding.action === "string" && binding.action) {
      const [domain, service] = binding.action.split(".");
      if (!Object.hasOwn(services?.[domain] ?? {}, service))
        hints.push({kind: "action-missing", path: `${path}.action`, ...location, action: binding.action});
    }
    const targets = binding.target?.entity_id;
    if (Array.isArray(targets)) targets.forEach((id, i) => entity(id, `${path}.target.entity_id[${i}]`, location));
    else if (typeof targets === "string" && targets !== "all" && targets !== "none") {
      for (const id of targets.split(",")) entity(id.trim(), `${path}.target.entity_id`, location);
    }
  };
  for (const {item, path, page, slot} of items(manifest)) {
    const location = {page, slot};
    if (Array.isArray(item.value?.refs)) item.value.refs.forEach((ref, i) =>
      entity(ref?.entity, `${path}.value.refs[${i}].entity`, location));
    entity(item.active?.entity, `${path}.active.entity`, location);
    entity(item.countdown, `${path}.countdown`, location);
    action(item.action, `${path}.action`, location);
    const ratio = contrastAgainstWhite(item.color);
    if (ratio !== null && ratio < 3) hints.push({kind: "contrast", path: `${path}.color`, ...location});
  }
  (Array.isArray(manifest?.pages) ? manifest.pages : []).forEach((page, index) => {
    if (page?.type !== "dial") return;
    for (const field of ["status", "value", "caption"]) {
      if (Array.isArray(page[field]?.refs)) page[field].refs.forEach((ref, i) =>
        entity(ref?.entity, `pages[${index}].${field}.refs[${i}].entity`, {page: index}));
    }
    entity(page.countdown, `pages[${index}].countdown`, {page: index});
  });
  for (const [key, binding] of entries(manifest?.buttons)) action(binding, `buttons.${key}`, {});
  entity(manifest?.display?.brightness, "display.brightness");
  return hints;
}

// Widths from UI::init in esphome/lunactl/ui.h: straight labels/values
// are 240px in Single/center and 160px in quarters. Curved labels have a
// 200px radius and 74 degrees of arc. All use Nunito 800 at 28px.
export const FIT_FONT = '800 28px "Lunactl Nunito"';
export function textFitHints(manifest, states, measure) {
  const hints = [];
  for (const {item, path, page, slot} of items(manifest)) {
    const type = manifest.pages[page].type;
    if (type === "dial") continue;
    const curved = type === "pie" && slot !== 4 && object(manifest.pages[page].center);
    const available = curved ? 200 * 74 * Math.PI / 180 : type === "single" || slot === 4 ? 240 : 160;
    const fields = [["label", item.label], ...(!curved ? [["value", formatValue(item.value, states)]] : [])];
    for (const [field, value] of fields) {
      if (typeof value !== "string" || !value) continue;
      // Measure each explicit line; character counts cannot predict font width.
      let width = -Infinity;
      for (const line of value.split(/\r\n|\r|\n/)) {
        width = Math.max(width, measure(line, FIT_FONT));
      }
      if (Number.isFinite(width) && width > available)
        hints.push({kind: "text-fit", path: `${path}.${field}`, page, slot});
    }
  }
  (Array.isArray(manifest?.pages) ? manifest.pages : []).forEach((page, index) => {
    if (page?.type !== "dial") return;
    for (const field of ["status", "value", "caption"]) {
      const value = formatValue(page[field], states);
      const location = {path: `pages[${index}].${field}`, page: index};
      if (field === "value" && /[^0123456789,.\-–°% ]/u.test(value))
        hints.push({kind: "dial-glyphs", ...location});
      const font = field === "value" ? '800 96px "Lunactl Nunito"' : FIT_FONT;
      if (value.split(/\r\n|\r|\n/).some((line) => measure(line, font) > (field === "status" ? 340 : 200)))
        hints.push({kind: "text-fit", ...location});
    }
  });
  return hints;
}
