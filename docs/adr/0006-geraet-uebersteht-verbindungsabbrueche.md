# Das Gerät übersteht Verbindungsabbrüche mit dem Manifest im RAM

Ein WLAN-Aussetzer soll das Kinderzimmer nicht auf „Keine Verbindung“ zurückwerfen. Verliert das Gerät die Verbindung zu Home Assistant, ist es Disconnected: Es zeigt weiter das letzte Manifest mit den letzten Werten und der letzten Helligkeit, eine Restzeit zählt lokal weiter, und Seitenwechsel funktionieren. Items und Tasten lösen nichts aus; ein Versuch blendet für einige Sekunden `mdi:wifi-off` oben in der Mitte ein. Nach 10 Minuten Disconnected bleibt das Symbol stehen, bis die Verbindung zurück ist. Damit ist der Abschnitt „Speicher“ von [ADR 0002](0002-firmware-rendert-manifest-aus-ha.md) für bestehende Verbindungen abgelöst.

Das Manifest bleibt nur im RAM. Nach einem Start ohne Home Assistant zeigt das Gerät weiterhin „Keine Verbindung“. Damit ein Abbruch nicht nach 15 Minuten doch dort endet, schalten wir ESPHomes `reboot_timeout` für `api` und `wifi` mit `0s` ab. Ein hängender Netzwerk-Stack heilt sich dadurch nicht mehr selbst; das nehmen wir in Kauf, weil das Symbol den Zustand zeigt und ein Aus- und Einschalten ihn behebt.

## Considered Options

- **Manifest im Flash (NVS):** Übersteht auch einen Neustart, schreibt aber bei jedem Speichern in den Flash, und nach dem Start fehlen trotzdem alle Werte.
- **Aktionen sammeln und nach dem Reconnect auslösen:** Ein „Papa rufen“ oder ein Licht-Wechsel Stunden später ist schlimmer als keiner.
- **Nach einer Frist auf „Keine Verbindung“ zurückfallen** (auch über ESPHomes voreingestellten Neustart nach 15 Minuten): Begrenzt veraltete Werte, beendet aber genau die Aussetzer, die das Gerät überstehen soll.
