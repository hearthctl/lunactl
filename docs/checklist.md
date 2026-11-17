# On-device checklist

Manual checks on the real StopWatch for issue #13, starting with the tracer
implemented in issue #3. Record the firmware commit, HA version and results.
Unchecked boxes are unverified, not passing.

Before starting:

- Flash this branch: `uvx esphome@2026.10.2 run esphome/lunactl.yaml`, using the
  household's local `esphome/secrets.yaml`.
- Load [the reference scripts](contracts/README.md) in HA, mapping this device's
  MAC to the example Manifest, with its input_boolean helper created.
- Enable **Allow the device to perform Home Assistant actions** for lunactl.
- Start logs with `uvx esphome@2026.10.2 logs esphome/lunactl.yaml --no-states`.

## Single Item tracer

- [ ] With HA stopped/disconnected, boot shows **Keine Verbindung** and touch
  triggers no action. Opening a log viewer alone leaves that state unchanged.
- [ ] Connect HA. The call to `script.lunactl_manifest` contains the StopWatch's
  actual Wi-Fi MAC. The returned single Item shows **Beispiel** in `#B91360`,
  fully inside the round display.
- [ ] Tap the Item: it visibly reacts, calls `script.lunactl_run` once, and
  toggles the example helper. Its `action` and JSON-text `data` match the Manifest.
- [ ] Change label and colour in HA, reload the scripts, and press **Manifest
  neu laden** in HA. The Item updates without reflashing.
- [ ] Replace the Manifest with an invalid colour, missing action or `schema: 2`.
  Reload logs a rejection, keeps the previous Item, and its tap still runs the
  previous action. Correcting the Manifest and reloading recovers.
- [ ] Disconnect HA while the log viewer remains open. **Keine Verbindung**
  replaces the Item, and touch cannot run it. Reconnect fetches again.
- [ ] Remove the device's MAC mapping and reboot. **Kein Manifest** appears;
  no action can be tapped. Restore the mapping and use **Manifest neu laden**
  to recover. A missing/failed `lunactl_manifest` call also logs its error and
  leaves **Kein Manifest** on a fresh connection.
- [ ] Deny action permission or make the Item's action fail. A failed tap is
  logged and is not retried. Restore permission/action and confirm recovery.
- [ ] Reboot/power cycle: no old Manifest appears before the new fetch. No
  unexpected errors occur during normal fetch, reload and tap.

## Battery (#10)

- [ ] On battery, **Akkustand** in HA and **Akku … %** on the display agree,
  stay within 0–100% and are plausible for the measured cell voltage. Repeat
  after a battery cold boot; record voltage, percentage and any I2C failures.
- [ ] Connect USB with a partly discharged battery. The level still reflects
  VBAT, rather than immediately becoming 100% from the USB supply. Disconnect
  USB and confirm updates continue within 10 seconds. Repeat near full charge.
- [ ] Below 20%, **Zurück an die Halterung** is visible and fully inside the
  round display, alongside the level. At 20% or above it disappears. Check
  while connected to USB and on battery, also with HA disconnected or no Manifest.
- [ ] If PMIC reads fail, logs report **M5PM1 battery unavailable**, the display
  shows **Akku -- %**, HA shows an unknown level, and no stale hint remains.
  A successful read restores the level and appropriate hint. If reliable PMIC
  readings cannot be achieved, record the failures and close #10 as won't-do.
