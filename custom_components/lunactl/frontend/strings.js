// All Designer text lives here, including API and JSON validation messages.
export const text = {
  preview: "Vorschau",
  previewApproximation: "Annäherung an die Darstellung auf dem Gerät.",
  previewFontsFailed: "Schriften konnten nicht geladen werden. Vorschau bitte neu laden.",
  page: (n) => `Seite ${n}`,
  title: "lunactl Designer",
  menu: "Seitenleiste öffnen",
  device: "Gerät",
  unnamed: "Unbenanntes Gerät",
  noDevices: "Keine lunactl-Geräte gefunden. Verbinde ein Gerät über ESPHome.",
  loading: "Wird geladen …",
  online: "Verbunden",
  offline: "Keine Verbindung",
  firmware: "Firmware",
  connection: "Verbindung",
  autosaveHint: "Gültige Änderungen werden nach etwa 1 s gespeichert. Das Gerät lädt 10 s nach der letzten Speicherung neu.",
  schema: "Schema-Version",
  unknown: "Unbekannt",
  requiredFirmware: "Benötigte Firmware",
  manifest: "Manifest (JSON)",
  noManifest: "Für dieses Gerät ist noch kein Manifest gespeichert.",
  create: "Manifest anlegen",
  copy: "JSON kopieren",
  copied: "JSON kopiert",
  copyFailed: "Kopieren nicht möglich. Markiere und kopiere den JSON-Text im Textfeld.",
  reload: "Neu laden",
  retry: "Erneut versuchen",
  conflict: "Manifest wurde anderswo geändert",
  conflictHelp: "Automatisches Speichern ist angehalten. Neu laden verwirft deine lokalen Änderungen.",
  empty: "Kein Manifest",
  saved: "Gespeichert",
  dirty: "Änderungen werden automatisch gespeichert …",
  validating: "Wird geprüft …",
  saving: "Wird gespeichert …",
  invalid: "Ungültig – nicht gespeichert",
  error: "Nicht gespeichert",
  savedOffline: "Gespeichert – wird beim nächsten Verbinden übernommen",
  savedRestart: "Neue Werte – Gerät startet in 10 s neu",
  jsonInvalid: "Ungültiges JSON. Prüfe Anführungszeichen, Kommas und Klammern.",
  objectRequired: "Das Manifest muss ein JSON-Objekt sein.",
  schemaInvalid: "Das Manifest entspricht nicht dem Schema dieses Geräts.",
  firmwareUnknown: "Firmware-Version unbekannt. Speichern ist erst mit lesbarer Firmware-Version möglich.",
  deviceGone: "Das Gerät ist nicht mehr verfügbar.",
  unavailable: "lunactl ist nicht geladen. Prüfe die Integration und lade neu.",
  forbidden: "Der Designer ist nur für Administratoren verfügbar.",
  requestFailed: "Die Verbindung zu Home Assistant ist fehlgeschlagen. Erneut versuchen.",
  tooLarge: "Das Manifest darf höchstens 32 KiB groß sein.",
  enumInvalid: "Ein Wert ist nicht erlaubt. Prüfe insbesondere die Symbole in der Symbolliste.",
  unexpectedFields: "Unbekannte Felder sind nicht erlaubt.",
  typeInvalid: "Ein Feld hat den falschen Datentyp.",
  patternInvalid: "Ein Feld hat ein ungültiges Format.",
  rangeInvalid: "Ein Wert oder die Anzahl der Einträge liegt außerhalb des erlaubten Bereichs.",
  requiredField: (field) => `Das Pflichtfeld „${field}“ fehlt.`,
};

export function errorText(error) {
  switch (error?.code) {
    case "stale_revision": return text.conflict;
    case "unknown_firmware": return text.firmwareUnknown;
    case "unknown_device": return text.deviceGone;
    case "not_loaded": return text.unavailable;
    case "unauthorized": return text.forbidden;
    case "invalid_manifest": {
      const message = error.message || "";
      const required = /^'([^']+)' is a required property$/.exec(message);
      if (required) return text.requiredField(required[1]);
      if (message.includes("32 KiB")) return text.tooLarge;
      if (message.includes("is not one of")) return text.enumInvalid;
      if (message.includes("Additional properties")) return text.unexpectedFields;
      if (message.includes("is not of type")) return text.typeInvalid;
      if (message.includes("does not match")) return text.patternInvalid;
      if (/too (short|long)|minimum|maximum/.test(message)) return text.rangeInvalid;
      return text.schemaInvalid;
    }
    default: return text.requestFailed;
  }
}
