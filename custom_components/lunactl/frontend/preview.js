import {formatValue} from "./value-format.js";
import {countdownView} from "./countdown.js";
import {icons} from "./icons.js";
import {text} from "./strings.js";

// Geometry and font sizes from esphome/lunactl/ui.h (UI::init/render),
// core.h (CENTER_HOLE_RADIUS, CENTER_QUARTER_ANGLE, QUARTER_ANGLES, dots_width)
// and esphome/lunactl.yaml (font_item, font_icon, font_countdown, font_battery).
const C = 233, R = 233, ITEM_R = 140, CENTER_HOLE = 168, LABEL_R = 200;
const ANGLES = [225, 315, 45, 135], QUARTER_ANGLE = 74;
const esc = (value) => (typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "")).replace(/[&<>"']/g,
  (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"})[c]);
const color = (item) => typeof item?.color === "string" && /^#[\da-fA-F]{6}$/.test(item.color) ? item.color : "#202020";
const number = (n) => Number(n.toFixed(3));
const point = (radius, angle) => [number(C + radius * Math.cos(angle * Math.PI / 180)),
  number(C + radius * Math.sin(angle * Math.PI / 180))].join(" ");
const arc = (radius, start, end, clockwise = true) =>
  `M ${point(radius, start)} A ${radius} ${radius} 0 ${Math.abs(end - start) > 180 ? 1 : 0} ${clockwise ? 1 : 0} ${point(radius, end)}`;
function label(value, x, y, size = 28, family = "Lunactl Nunito") {
  if (value === undefined || value === null || value === "") return "";
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${family === "Lunactl MDI" ? 400 : 800}" text-anchor="middle" dominant-baseline="hanging" fill="#FFFFFF">${esc(value)}</text>`;
}
function ring(item, states, now) {
  const countdown = countdownView(typeof item?.countdown === "string" ? states?.[item.countdown] : undefined, now);
  if (!countdown) return {svg: "", text: ""};
  const rgb = color(item).slice(1).match(/../g).map((part) => parseInt(part, 16));
  const mix = (white, weight) => `#${rgb.map((n) => Math.floor((n * (255 - weight) + white * weight) / 255).toString(16).padStart(2, "0")).join("")}`;
  // A complete circle needs two SVG arcs. Indicator starts at 12 o'clock.
  const full = `${arc(152, -90, 90)} A 152 152 0 0 1 ${point(152, 270)}`;
  const indicator = countdown.ring === 1000 ? full : arc(152, -90, -90 + countdown.ring * 0.36);
  return {text: countdown.text, svg: `<g fill="none" stroke-width="8" stroke-linecap="round"><path d="${full}" stroke="${mix(0, 175)}"/><path d="${indicator}" stroke="${mix(255, 160)}"/></g>`};
}
function slotGroup(slot, type, item, editor) {
  return `<g data-slot="${slot}"${editor ? ` role="button" tabindex="0" aria-label="${esc(text.slot(type, slot))}${item == null ? `: ${esc(text.addItem)}` : ""}" aria-pressed="${editor.selectedSlot === slot}" data-empty="${item == null}"` : ""}>`;
}
function hintMarker(hints, slot, x, y) {
  const affected = hints.filter((hint) => hint.slot === slot);
  if (!affected.length) return "";
  return `<g data-hint-slot="${slot}" pointer-events="none"><title>${esc(affected.map((hint) => text.hintMessages[hint.kind](hint)).join(" · "))}</title><circle cx="${x}" cy="${y}" r="12" fill="#FFB52E" stroke="#000000" stroke-width="2"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="bold" fill="#000000">!</text></g>`;
}
function mainSlot(item, states, now, center, editor) {
  const countdown = ring(item, states, now);
  return slotGroup(center ? 4 : 0, center ? "pie" : "single", item, editor) + `<circle cx="233" cy="233" r="${ITEM_R}" fill="${color(item)}"/>` +
    (center ? label(item?.label, C, 149) + label(countdown.text, C, 198, 48) :
      label((typeof item?.icon === "string" && Object.hasOwn(icons, item.icon) ? icons[item.icon] : ""), C, 138, 48, "Lunactl MDI") + label(item?.label, C, 213) + label(countdown.text, C, 307)) +
    label(formatValue(item?.value, states), C, 267) + countdown.svg +
    (editor && item == null ? label("+", C, 200, 48) : "") + "</g>";
}

// Accept partial JSON drafts without throwing. This does not validate or save.
// time = {timestamp: Unix seconds, clock: HH:MM in HA's configured timezone}.
export function renderPreview(manifest, states = {}, time = {}, pageIndex = 0, editor = null, hints = []) {
  const pages = Array.isArray(manifest?.pages) ? manifest.pages.slice(0, 6) : [];
  const index = Math.max(0, Math.min(pages.length - 1, Number.isInteger(pageIndex) ? pageIndex : 0));
  const page = pages[index];
  const pageHints = hints.filter((hint) => hint.page === index);
  let body = "";
  if (page?.type === "single") body = mainSlot(page.item, states, time.timestamp, false, editor);
  else if (page?.type === "pie") {
    const center = page.center && typeof page.center === "object";
    const quarters = Array.isArray(page.quarters) ? page.quarters : [];
    for (let slot = 0; slot < 4; slot++) {
      const item = quarters[slot];
      body += slotGroup(slot, "pie", item, editor);
      if (center) {
        const start = ANGLES[slot] - QUARTER_ANGLE / 2, end = ANGLES[slot] + QUARTER_ANGLE / 2;
        const middle = (R + CENTER_HOLE) / 2;
        body += editor ? `<path d="${arc(R, start, end)} L ${point(CENTER_HOLE, end)} A ${CENTER_HOLE} ${CENTER_HOLE} 0 0 0 ${point(CENTER_HOLE, start)} Z" fill="${color(item)}"/>` :
          `<path d="${arc(middle, start, end)}" fill="none" stroke="${color(item)}" stroke-width="${R - CENTER_HOLE}"/>`;
        const id = `label-${slot}`;
        body += `<defs><path id="${id}" d="${slot < 2 ? arc(LABEL_R, start, end) : arc(LABEL_R, end, start, false)}"/></defs>`;
        if (item?.label) body += `<text font-family="Lunactl Nunito" font-size="28" font-weight="800" fill="#FFFFFF" dominant-baseline="middle" text-anchor="middle"><textPath href="#${id}" startOffset="50%">${esc(item.label)}</textPath></text>`;
      } else {
        // Firmware uses square quarters clipped by the round display, 6px dividers.
        const start = [180, 270, 0, 90][slot];
        body += `<path d="M 233 233 L ${point(R, start)} A 233 233 0 0 1 ${point(R, start + 90)} Z" fill="${color(item)}"/>`;
        const x = slot === 1 || slot === 2 ? 334 : 134;
        const y = slot >= 2 ? 334 : 134;
        body += label((typeof item?.icon === "string" && Object.hasOwn(icons, item.icon) ? icons[item.icon] : ""), x, y - 54, 48, "Lunactl MDI") +
          label(item?.label, x, y + 4) + label(formatValue(item?.value, states), x, y + 38);
      }
      if (editor && item == null) {
        const radius = center ? (R + CENTER_HOLE) / 2 : 140;
        const [x, y] = point(radius, ANGLES[slot]).split(" ");
        body += label("+", x, Number(y) - 16, 32);
      }
      body += "</g>";
    }
    if (center) body += mainSlot(page.center, states, time.timestamp, true, editor);
    else {
      body += '<path d="M 233 0 V 466 M 0 233 H 466" stroke="#000000" stroke-width="6"/>';
      if (editor) body += slotGroup(4, "pie", null, editor);
      body += '<circle cx="233" cy="233" r="56" fill="#000000"/>';
    }
    body += label(/^\d{2}:\d{2}$/.test(time.clock) ? time.clock : "--:--", C, center ? 3 : 215, center ? 20 : 28);
    if (!center && editor) body += label("+", C, 247, 24) + "</g>";
  }
  if (page?.type === "single") body += hintMarker(pageHints, 0, 335, 155);
  else if (page?.type === "pie") {
    for (let slot = 0; slot < 4; slot++) {
      // Keep the marker inside the curved label path and clear of the center countdown ring.
      const [x, y] = point(page.center ? CENTER_HOLE + 4 : 168, ANGLES[slot]).split(" ").map(Number);
      body += hintMarker(pageHints, slot, x, y);
    }
    body += hintMarker(pageHints, 4, 335, 155);
  }
  if (pages.length > 1) {
    const width = pages.length * 18 + 14, left = (466 - width) / 2;
    body += `<g data-pages="true"><rect x="${left}" y="437" width="${width}" height="28" rx="14" fill="#000000"/>`;
    for (let i = 0; i < pages.length; i++) body += `<g data-page="${i}" role="button" tabindex="0" aria-label="${esc(text.page(i + 1))}" aria-pressed="${i === index}"><circle cx="${left + 16 + i * 18}" cy="451" r="9" fill="transparent"/><circle cx="${left + 16 + i * 18}" cy="451" r="5" fill="${i === index ? "#FFFFFF" : "#666666"}"/></g>`;
    body += "</g>";
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 466 466" role="img" aria-label="${esc(text.preview)}"><defs><clipPath id="display-clip"><circle cx="233" cy="233" r="233"/></clipPath></defs><g clip-path="url(#display-clip)"><circle cx="233" cy="233" r="233" fill="#000000"/>${body}</g></svg>\n`;
}

export function previewTime(now, timezone) {
  return {timestamp: Math.floor(now / 1000), clock: new Intl.DateTimeFormat("de-DE", {
    timeZone: timezone || "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(now))};
}
