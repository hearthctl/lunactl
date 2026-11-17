# Das Gerät meldet seine Schema-Version über die Firmware-Version

Firmware und Integration werden unabhängig aktualisiert: die Firmware von Hand per OTA, die Integration über HACS. Eine neuere Integration könnte deshalb Manifeste speichern, die ein Gerät mit älterer Firmware ablehnt; nach einem Neustart zeigt es dann „Kein Manifest“. Damit das nicht passiert, bietet der Designer pro Gerät nur an, was dessen Firmware darstellen kann, und speichert nichts darüber hinaus.

Die Fähigkeiten einer Firmware sind die höchste Schema-Version, die sie annimmt. Diese steckt in der Hauptversion von `project: version` in `esphome/lunactl.yaml`: Firmware `2.3` nimmt Manifeste bis `schema: 2` an, die `3` zählt Korrekturen ohne Schema-Änderung. Die ESPHome-Integration in HA trägt diese Version als `sw_version` („2.3 (ESPHome …)“) in die Geräteregistrierung ein. Die lunactl-Integration liest sie dort, auch wenn das Gerät gerade offline ist oder noch kein Manifest hat. Ein Test stellt sicher, dass die Hauptversion zur höchsten Schema-Version passt, die der Firmware-Kern annimmt.

## Regeln

- **Schema-Versionen erweitern nur:** `schema: N+1` fügt hinzu, entfernt oder ändert nichts. Neue Symbole, Page types oder Item-Felder erhöhen die Version. Die Firmware nimmt jedes Manifest von `schema: 1` bis zu ihrer Hauptversion an.
- **Ein Schema pro Version:** Jede Version liegt vollständig als `schema/manifest.vN.schema.json` vor und ist ab ihrer Veröffentlichung eingefroren. `schema: 1` friert mit der ersten Veröffentlichung der Integration ein; bis dahin darf es sich noch ändern.
- **Speichern:** Die Integration prüft ein Manifest gegen das Schema der Geräteversion. Ist die Firmware neuer als die Integration, gilt deren höchstes Schema. Ohne lesbare Firmware-Version speichert der Designer nicht.
- **Ältere Firmware als Manifest**, etwa nach einem Rückschritt: Die Integration liefert das Manifest unverändert aus, das Gerät lehnt es ab und protokolliert den Grund. Der Designer zeigt an, welche Firmware das Manifest braucht.

## Considered Options

- **Gemeinsame Versionsnummer und Warnung im Designer:** Einfach, aber wer die Warnung übersieht, landet bei „Kein Manifest“ im Kinderzimmer.
- **Tolerante Firmware, die Unbekanntes ignoriert:** Ältere Firmware würde sanft weniger zeigen, aber ein Tippfehler in einem Feldnamen fiele nicht mehr auf, und Schema und Firmware würden nicht mehr dieselben Manifeste annehmen.
- **Fähigkeitsliste vom Gerät (Page types, Felder, Symbole):** Feiner, aber eine zweite Beschreibung der Fähigkeiten neben dem Schema, mit mehr Code auf beiden Seiten.
- **Schema-Version als Feld beim Abruf von `lunactl.manifest`:** Die Integration kennt die Version erst nach dem ersten Abruf. Die Geräteregistrierung kennt sie, sobald das Gerät in HA eingerichtet ist.
- **Tabelle von Firmware-Version zu Schema-Version in der Integration:** Muss bei jeder Firmware gepflegt werden. Die Hauptversion trägt die Information selbst.
