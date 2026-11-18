# Die Firmware rendert ein Manifest aus Home Assistant

Die Aussagen zur Auslieferung der Vertrags-Scripts ohne eigene HA-Integration sowie die Script-Aufrufe unter „Abruf“ und „Aktionen“ sind durch [ADR 0003: Manifeste entstehen im Designer und liegen in Home Assistant](0003-manifeste-aus-dem-designer-in-ha.md) abgelöst. Dort übernimmt eine verpflichtende lunactl-Integration den Vertrag und die Speicherung der Manifeste. Die Firmware bleibt ein Renderer.

Die Aussage unter „Speicher“, dass das Gerät ohne Verbindung „Keine Verbindung“ zeigt, ist durch [ADR 0006: Das Gerät übersteht Verbindungsabbrüche mit dem Manifest im RAM](0006-geraet-uebersteht-verbindungsabbrueche.md) abgelöst. Nach einem Verbindungsabbruch zeigt es das letzte Manifest weiter; nur nach einem Start ohne Home Assistant bleibt es bei „Keine Verbindung“.

Die Firmware weiß nichts über Lichter, Klima oder Papa. Sie holt sich ein Manifest aus Home Assistant und stellt es dar: welche Seiten es gibt, welches Item in welchem Slot steht und was die Tasten auslösen. Fest in der Firmware stehen nur die Page types, die Symbolliste, das Formatieren von Werten und das Geräteverhalten (Aufwachen, Uhr, Akku, Offline-Anzeige). Jeder Haushalt baut sein Manifest selbst; Szenen, Timer und Automationen wie Klima-Lauf oder Papa rufen sind Haus-Logik und liegen bei uns in hearth. lunactl liefert die Firmware, das Manifest-Schema und die zwei Vertrags-Scripts `lunactl_manifest` und `lunactl_run` als getestete Referenz in der Doku, die ein Haushalt einmal übernimmt. Die beiden Repos hängen nur über diesen Vertrag zusammen, nicht über Script-Namen der Haus-Logik oder eine gemeinsame Package-Datei.

## Vertrag

- **Abruf:** Bei jeder Verbindung ruft das Gerät `script.lunactl_manifest` mit dem Feld `mac` auf (seine eigene MAC-Adresse) und bekommt das Manifest als JSON-Antwort (`capture_response`, höchstens 32 KiB). Wie HA eine MAC einem Manifest zuordnet, ist Sache von HA. Eine Button-Entität „Manifest neu laden“ holt es zusätzlich von Hand.
- **Inhalt:** Das Manifest ist reines JSON ohne Jinja und beginnt mit `schema: 1`. Das Schema liegt als JSON-Schema in lunactl. Ein Gerät lehnt ein Manifest mit unbekannter Schema-Version oder ungültigem Inhalt ab und meldet das im Log.
- **Werte:** Items verweisen auf Entitäten und Attribute. Das Gerät abonniert sie und formatiert sie selbst, aber nur einfach: Platzhalter, Dezimalstellen, Dezimalkomma und eine Übersetzungstabelle. Alles mit echter Logik wird in HA ein Template-Sensor. Eine Restzeit verweist auf einen `timer` und wird aus `finishes_at` und `duration` auf dem Gerät heruntergezählt.
- **Aktionen:** Items und Tasten enthalten vollständige HA-Aktionen mit `target` und `data`. Das Gerät führt sie über `script.lunactl_run` aus, das `action` und `data` (als JSON-Text) bekommt und weiterreicht.
- **Speicher:** Das Gerät speichert kein Manifest. Ohne Verbindung zeigt es „Keine Verbindung“.

HA meldet Entitäts-Abos nur beim Verbinden ab und kennt kein Abmelden. Ein neues oder geändertes Manifest mit neuen Abos löst deshalb eine neue Verbindung bzw. einen Neustart des Geräts aus; beim ersten Start heißt das: verbinden, Manifest holen, neu verbinden.

## Considered Options

- **Feste Firmware plus HA-Package aus lunactl:** Jede neue Taste und jeder Text bräuchte eine neue Firmware, und hearth müsste ein Package aus lunactl übernehmen. Diese Kopplung zwischen den Repos war der Anlass für die Entscheidung.
- **Manifest als Attribut einer Entität:** HA schickt Attribute als Python-Text statt JSON, und ESPHome kann `std::string` nur bis 254 Byte im Flash halten.
- **Abos per selbst gebauter API-Nachricht nachmelden:** Spart den zweiten Verbindungsaufbau, hängt aber an ESPHome-Interna. Bleibt Ausweichlösung, falls der Start zu lange dauert.
- **Beliebige Aktionen direkt aus C++ senden:** Spart `script.lunactl_run`, hängt aber ebenfalls an generierten ESPHome-Interna.
- **Alle Symbole im Flash oder Bilder zur Laufzeit:** Alle MDI-Symbole passen nicht in den Flash; Bilder von `/local` bräuchten zusätzliche Dateien in hearth und HTTP-Abrufe. Es bleibt eine kuratierte Symbolliste.
