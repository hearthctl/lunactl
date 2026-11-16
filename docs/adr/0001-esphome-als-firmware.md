# ESPHome als Firmware, mit Fallback auf ESP-IDF

Die Firmware für lunactl wird mit ESPHome und LVGL gebaut. Den Ausschlag gibt die HA-Anbindung: Über die native ESPHome-API baut Home Assistant die Verbindung auf, und das Gerät darf nur die Aktionen auslösen, die HA erlaubt. Auf dem Gerät liegt kein HA-Token und keine MQTT-Zugangsdaten. Das ist wichtig, weil das Gerät frei zugänglich im Kinderzimmer liegt und sein Flash unverschlüsselt ist. Zusätzlich gibt es OTA-Updates und Status-Entitäten, ohne dass wir dafür Code schreiben müssen.

Der Preis dafür ist das Risiko bei der Inbetriebnahme. Für die StopWatch gibt es keine fertige ESPHome-Konfiguration. Display-Strom und Display-Reset hängen am Expander M5IOE1, für den es nur eine externe Komponente von M5Stack gibt. Für den Power-Chip M5PM1 existiert nur eine ungetestete Community-Komponente. Deshalb kommt zuerst ein Spike, der Display, Touch und M5IOE1 in ESPHome zum Laufen bringt. Scheitert er, wechseln wir zu ESP-IDF mit M5Unified/M5GFX und LVGL, der Basis der Werks-Demo. Die HA-Anbindung müssen wir dann neu entscheiden.

## Considered Options

- **ESP-IDF + M5Unified/M5GFX + LVGL:** Die Hardware läuft hier sicher. HA gibt es aber nur über MQTT, was einen Broker erfordert, den es in diesem HA-Setup ohne Add-ons nicht gibt, oder über die WebSocket-API mit Long-Lived Token. Ein solcher Token hat volle Admin-Rechte und würde auf einem frei zugänglichen Gerät liegen.
- **openHASP:** Das Projekt wird praktisch nicht mehr gepflegt (letzte Release 0.7.0-rc13 aus dem Jahr 2024) und unterstützt den Display-Controller CO5300 nicht.
