// Port of esphome/lunactl/core.h: format_reference and Core::value.
// HA attributes arrive as JSON values; ESPHome exposes them as state text.
export function stateText(states, ref) {
  if (!ref || typeof ref.entity !== "string" || (ref.attribute !== undefined && typeof ref.attribute !== "string")) return "";
  const entity = states?.[ref.entity];
  const value = ref.attribute ? entity?.attributes?.[ref.attribute] : entity?.state;
  if (value === undefined || value === null) return "";
  // HA esphome/manager.py forwards boolean attributes as on/off.
  if (ref.attribute && typeof value === "boolean") return value ? "on" : "off";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

// snprintf("%.*f") rounds the exact binary double to nearest, ties to even.
// toFixed uses a different tie rule and switches to exponent notation at 1e21.
function fixed(number, decimals) {
  const data = new DataView(new ArrayBuffer(8));
  data.setFloat64(0, Math.abs(number));
  const bits = data.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 2047n);
  const mantissa = (bits & ((1n << 52n) - 1n)) | (exponent ? 1n << 52n : 0n);
  const shift = (exponent || 1) - 1023 - 52;
  let numerator = mantissa * 10n ** BigInt(decimals);
  const denominator = shift < 0 ? 1n << BigInt(-shift) : 1n;
  if (shift > 0) numerator <<= BigInt(shift);
  let rounded = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * 2n > denominator || (remainder * 2n === denominator && rounded % 2n)) rounded++;
  let result = rounded.toString().padStart(decimals + 1, "0");
  if (decimals) result = `${result.slice(0, -decimals)}.${result.slice(-decimals)}`;
  return number < 0 && rounded !== 0n ? `-${result}` : result;
}

export function formatReference(ref, state) {
  if (!state || !ref || typeof ref !== "object") return "--";
  if (ref.decimals !== undefined && (!Number.isInteger(ref.decimals) || ref.decimals < 0 || ref.decimals > 6)) return "--";
  if (ref.map && Object.hasOwn(ref.map, state)) return typeof ref.map[state] === "string" ? ref.map[state] : "--";
  if (state === "unknown" || state === "unavailable") return "--";
  if (ref.decimals === undefined && !ref.decimal_comma) return state;
  // strtod permits leading ASCII whitespace, but no trailing text/whitespace.
  if (state.trimEnd() !== state) return "--";
  const decimal = /^[\t\n\v\f\r ]*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(state);
  const hex = /^[\t\n\v\f\r ]*([+-]?)0[xX]([\da-fA-F]+(?:\.[\da-fA-F]*)?|\.[\da-fA-F]+)(?:[pP]([+-]?\d+))?$/.exec(state);
  let number = decimal ? Number(state) : NaN;
  if (hex) {
    const [whole, fraction = ""] = hex[2].split(".");
    number = (parseInt(whole || "0", 16) + (fraction ? parseInt(fraction, 16) / 16 ** fraction.length : 0)) *
      2 ** Number(hex[3] || 0) * (hex[1] === "-" ? -1 : 1);
  }
  if (!Number.isFinite(number) || (Math.abs(number) < 2 ** -1022 && /[1-9a-f]/i.test(state.replace(/(?:[ep][+-]?\d+)$/i, "")))) return "--";
  let result = ref.decimals === undefined ? state : fixed(number, ref.decimals);
  if (ref.decimal_comma) result = result.replaceAll(".", ",");
  return result;
}

export function formatValue(value, states) {
  if (!value || typeof value.format !== "string" || !Array.isArray(value.refs)) return "";
  const replacements = value.refs.map((ref) => formatReference(ref, stateText(states, ref)));
  return value.format.replace(/\{(0|[1-9]\d*)\}/g,
    (token, index) => Number(index) < replacements.length ? replacements[Number(index)] : token);
}
