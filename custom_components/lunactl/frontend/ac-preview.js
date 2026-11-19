// Managed AC pages are projected only for display; never write this Dial back.
export function acPreview(page, states = {}) {
  const ids = Object.fromEntries(Object.entries(states ?? {})
    .filter(([, state]) => state.attributes?.lunactl_ac === page.entity)
    .map(([id, state]) => [state.attributes.field, id]));
  const bottom = (label, color, icon, mode) => ({label, color, icon,
    active: {entity: page.entity, states: [mode]}});
  return {type: "dial", ...Object.fromEntries(["status", "value", "caption"].map((field) =>
    [field, {format: "{0}", refs: [{entity: ids[field] ?? ""}]}])), countdown: ids.timer,
    minus: {color: "#374151", active: {entity: ids.adjustable ?? "", states: ["on"]}},
    plus: {color: "#374151", active: {entity: ids.adjustable ?? "", states: ["on"]}},
    items: [bottom("Kühlen", "#2876A8", "mdi:snowflake", "cool"),
      bottom("Klima aus", "#56616D", "mdi:power", "off"),
      bottom("Heizen", "#B85C20", "mdi:fire", "heat")]};
}
