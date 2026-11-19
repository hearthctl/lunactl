# AC-Dial bleibt eine verwaltete Konfiguration im Designer

Der Designer bietet „AC-Dial hinzufügen“ an. Der Haushalt wählt eine Klimaanlage,
eine Laufzeit und Temperaturgrenzen. Die Seite bleibt eine AC-Konfiguration:
Sie wird über diese Einstellungen geändert, nicht über frei editierbare Slots.
Die lunactl-Integration verwaltet die zugehörigen Aktionen, den Klima-Lauf,
den Sollwert und die Anzeige-Werte. Daraus entsteht für die Firmware ein
gewöhnliches Dial-Manifest; es gibt keinen neuen Firmware-Page-type.

Jede Designer-Seite besitzt eine eigene AC-Konfiguration mit Laufzeit und
Temperaturgrenzen. Der tatsächlich aktive Lauf gehört zur Klimaanlage: Der
letzte Start übernimmt mit den Einstellungen der startenden Seite und ersetzt
den vorherigen Lauf. Alle Seiten für dieselbe Klimaanlage zeigen denselben
Timerstand, Modus und aktuellen Sollwert. Minus/Plus ändern diesen Sollwert,
ohne die Laufzeit zu verlängern. Ein ersetzter Timer darf nicht mehr abschalten.

Diese Entscheidung erweitert [ADR 0002](0002-firmware-rendert-manifest-aus-ha.md):
Die verwaltete AC-Funktion gehört zur HA-Integration, nicht zur versionierten
Haushaltskonfiguration in Hearth. Andere Haushaltsaktionen bleiben außerhalb
von lunactl. AC-Konfigurationen und Geräte-Manifeste sind HA-Daten gemäß
[ADR 0003](0003-manifeste-aus-dem-designer-in-ha.md).

Die Integration erzeugt keine einmalige Vorlage, die der Haushalt anschließend
als Skripte und Helper pflegen muss. Sie bleibt für die Ausführung und den
Lebenszyklus der AC-Funktion verantwortlich. Das bereits auf Hermine installierte
Hearth-Package bleibt bis zur geprüften Ablösung bestehen; der geschlossene
Hearth-PR #37 ist nicht die dauerhafte Quelle dieser Funktion.
