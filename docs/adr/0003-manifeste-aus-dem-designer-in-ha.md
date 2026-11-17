# Manifeste entstehen im Designer und liegen in Home Assistant

Ein Haushalt stellt seine Manifeste im Designer zusammen. Der Designer ist eine Seite der lunactl-Integration in Home Assistant, technisch als Panel eingebunden. Die Integration liegt in diesem Repo unter `custom_components/lunactl` und wird über HACS installiert. Damit liegen Geräteauswahl, Bearbeitung und Speicherung dort, wo auch die Entitäten und Aktionen des Haushalts liegen.

Manifeste sind HA-Daten und werden im Storage der Integration gespeichert, nicht als Haushaltskonfiguration in git. Pro HA-Gerät gibt es ein Manifest. Der Designer listet die Geräte, deren ESPHome-`project` den Namen `hearthctl.lunactl` trägt, unter ihrem HA-Namen auf. Die MAC-Adresse bleibt ein internes Zuordnungsmerkmal; der Haushalt wählt sein Gerät aus.

## Vertrag

Diese Entscheidung löst die Vertrags-Scripts und die Bereitstellung ohne eigene HA-Integration aus [ADR 0002](0002-firmware-rendert-manifest-aus-ha.md) ab. Die Integration ist erforderlich; die Referenz-Scripts entfallen. Die Firmware ruft direkt `lunactl.manifest` und `lunactl.run` auf. Die bisherigen Nachrichtenformate bleiben erhalten:

- **Abruf:** Bei jeder Verbindung ruft das Gerät `lunactl.manifest` mit dem Feld `mac` auf. Die Integration ordnet die MAC intern dem HA-Gerät zu und antwortet mit dessen Manifest als Mapping, ohne zusätzlichen Wrapper oder JSON-Text; ohne Manifest mit `{}`. Die Firmware nutzt weiter `capture_response` und erhält das Mapping in `response["response"]`. Die Grenze bleibt 32 KiB. Das Gerät speichert weiterhin kein Manifest dauerhaft.
- **Aktionen:** Items und Tasten enthalten vollständige HA-Aktionen mit `target` und `data`. Das Gerät ruft `lunactl.run` mit den String-Feldern `action` und `data` auf. `data` ist JSON-Text mit den ursprünglichen Objekten `target` und `data`; fehlende Objekte werden zu `{}`. Die Integration dekodiert diese Hülle und reicht die Aktion samt Ziel und Daten an HA weiter. Die Haus-Logik bleibt in HA.
- **Speichern:** Beim Speichern im Designer validiert die Integration das Manifest gegen [`schema/manifest.schema.json`](../../schema/manifest.schema.json). Ein ungültiges Manifest wird abgewiesen; das gespeicherte Manifest bleibt erhalten. Nach erfolgreichem Speichern betätigt die Integration die Button-Entität „Manifest neu laden“ des Geräts, damit es das Manifest erneut abruft.

Die Vorschau im Designer nähert die Page types im Browser an. Sie verwendet nicht das Rendering der Firmware und verspricht keine pixelgenaue Darstellung auf dem Gerät.

## Considered Options

- **Offline-Bearbeitung mit Manifest-Dateien im git-Repo des Haushalts:** Passt zu versionierter Haushaltskonfiguration, trennt die Bearbeitung aber von den Geräten, Entitäten und Aktionen in HA und verlangt einen zusätzlichen Weg zur Übertragung. Stattdessen verwaltet HA die Manifeste als Daten der Integration.
- **Integration zuerst, Vertrags-Scripts als Fallback:** Würde bestehende Script-Installationen weiter bedienen, ließe aber zwei Vertragsimplementierungen und Speicherwege bestehen. Die Integration ist deshalb verpflichtend; die Firmware fällt nicht auf Scripts zurück.
- **LVGL als WASM für eine pixelgenaue Vorschau:** Würde das Firmware-Rendering im Browser wiederverwenden, koppelt den Designer aber an dessen Build und Laufzeit. Für das Zusammenstellen eines Manifests genügt die Annäherung der Page types im Browser.
- **Nur Page-/Slot-Referenzen an `lunactl.run` senden:** Würde die vollständige Aktion erst in HA auflösen, bringt aber keinen Sicherheitsgewinn: ESPHomes Berechtigung zum Ausführen von HA-Aktionen gilt für alle Aktionen oder für keine. Deshalb bleibt die bisherige Hülle mit `action` und `data` erhalten.
