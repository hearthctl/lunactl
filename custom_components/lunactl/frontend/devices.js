import {text} from "./strings.js";

// The integration selects ESPHome project hearthctl.lunactl in HA's registry.
export function deviceList(records) {
  return records.map((record) => ({
    ...record,
    name: record.name || text.unnamed,
  })).sort((a, b) => a.name.localeCompare(b.name, "de", {numeric: true}) ||
    a.device_id.localeCompare(b.device_id));
}

export function deviceHeader(record) {
  return {
    name: record.name || text.unnamed,
    connection: record.online ? text.online : text.offline,
    firmware: record.firmware_version || text.unknown,
    schema: record.schema_version ?? text.unknown,
    requiredFirmware: record.required_firmware &&
      record.manifest.schema > record.schema_version ? record.required_firmware : null,
  };
}
