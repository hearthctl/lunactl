# On-device checklist

Manual checks on the real StopWatch for [issue #13](https://github.com/hearthctl/lunactl/issues/13),
using [the room example](../examples/child-room.json). Unchecked boxes are
unverified, not passing. `make verify` checks the example and firmware in
software; completing this document on hardware is the separate acceptance in #13.

Record each run before starting:

| Run detail | Result |
| --- | --- |
| Date, tester, StopWatch identification | |
| Firmware commit (`git rev-parse HEAD`), ESPHome and HA versions | |
| Test HA, device Wi-Fi MAC, adapted Manifest/variant used | |
| Boot reconnect delay / new-subscription restart delay | |
| Battery voltage, USB/battery state and level observations | |
| Failed or skipped boxes, logs/photos and follow-up issue links | |

## Preparation and temporary variants

Before starting:

- Flash this branch: `uvx esphome@2026.10.2 run esphome/lunactl.yaml`, using the
  household's local `esphome/secrets.yaml`.
- Follow [household setup](household.md): install lunactl as a HACS custom
  integration, restart HA and add lunactl under Devices & services. Open
  **lunactl** in the sidebar as an administrator, select this device by its HA
  name, choose **Manifest anlegen** if needed and paste the adapted room example
  into **Manifest (JSON)**. Prepare its test entities/actions. Keep a
  copy of that working Manifest for restoration after each variant.
- Enable **Allow the device to perform Home Assistant actions** for lunactl.
- Start logs with `uvx esphome@2026.10.2 logs esphome/lunactl.yaml --no-states`.
- Use a test HA and inspect HA script traces/target states to count actions.
  For gesture, icon and touch tests, replace actions with
  `{"action":"input_boolean.toggle","target":{"entity_id":"input_boolean.lunactl_example"}}`
  and create that helper. This avoids repeated notifications and appliance runs.
- For every temporary variant below, edit or paste the JSON in the Designer.
  Valid JSON is autosaved about 1 s after the last edit; wait for **Gespeichert**
  and the integration's delayed reload, 10 s after the last save. Invalid JSON
  or schema errors remain visible and leave the stored Manifest unchanged.
  Return to the saved room example after each section. A new reference shows
  **Neue Werte – Gerät startet in 10 s neu** and automatically restarts the device.
  Do not edit contract scripts or press the reload button for these checks.
- To keep the display awake during visual checks, temporarily set
  `display.timeout` to `120`; restore `10` for the display tests.
- Variants are edits to the room JSON, not additional Page types: remove Klima's
  `center` for another plain Pie; copy Licht Items into its `null` quarters to
  fill all four curved quarters; add Klima center's `countdown` to Papa's `item`
  for Single countdown checks. To test six pages, duplicate the three example
  pages once and give their labels distinct suffixes. To test one page, keep
  just Licht. These changes stay within the schema.

## Fetch, actions, errors and reload (#3)

- [ ] The Designer is visible in the sidebar for an admin and absent for a
  non-admin. Its device list uses HA names; the selected device's header shows
  its online state, firmware and schema version. A device with no Manifest
  offers **Manifest anlegen** and creates nothing until pressed; pressing it
  saves an empty Pie with four `null` quarters and `schema: 1`.
- [ ] Start unsaved drafts in two admin tabs from the same revision. Let one
  autosave while the other still has invalid JSON, then finish valid JSON there:
  **Manifest wurde anderswo geändert** stops autosaving there.
  **JSON kopieren** retains that tab's local JSON; **Neu laden** drops the local
  draft and reads the stored Manifest. Subsequent edits autosave again.
- [ ] While the device is offline, edit a valid Manifest: the state reads
  **Gespeichert – wird beim nächsten Verbinden übernommen**. On reconnect the
  device fetches the saved Manifest.

- [ ] With HA stopped/disconnected, boot shows **Keine Verbindung** and touch
  triggers no action. Opening a log viewer alone leaves that state unchanged.
- [ ] Connect HA. The call to `lunactl.manifest` contains the StopWatch's
  actual Wi-Fi MAC. Licht appears first, then navigating to Papa shows its
  **Papa rufen** Single Item in `#B91360`, fully inside the round display.
- [ ] Tap a lit Item: it visibly reacts and calls `lunactl.run` once.
  Its `action` and JSON-text `data` match the Manifest. With the test helper
  action, the helper toggles exactly once. Check a target-bearing Licht action
  and a script action with omitted target/data (forwarded as empty objects).
- [ ] Change label and colour in the Designer. About 1 s after the last edit
  the state becomes **Gespeichert**; the Item updates about 10 s later without
  reflashing or pressing **Manifest neu laden**. Continue editing within those
  10 s: only one reload happens, 10 s after the final save.
- [ ] Try saving an invalid colour or missing action. Saving fails, keeps the
  previous revision and Item, and its tap still runs the previous action.
  Firmware rejection of malformed or unsupported schemas is covered by the
  host tests; the integration prevents storing those through the normal API.
- [ ] Disconnect HA while the log viewer remains open. The Item stays visible
  (Disconnected), and touch cannot run it. Reconnect fetches again.
- [ ] In the test HA, remove and re-add the ESPHome device, then reboot it. Its
  deleted Manifest yields **Kein Manifest**; no action can be tapped. Save the
  room Manifest for the re-added device to recover. A missing/failed `lunactl.manifest` call also logs its error and
  leaves **Kein Manifest** on a fresh connection.
- [ ] Deny action permission or make the Item's action fail. A failed tap is
  logged and is not retried. Restore permission/action and confirm recovery.
- [ ] Reboot/power cycle: no old Manifest appears before the new fetch. No
  unexpected errors occur during normal fetch, reload and tap.

## Pie without center, pages, icons and Single (#4)

- [ ] Licht has four coloured quarters in clockwise order from top-left:
  Hell, Lesen, Gemütlich, Schlafen gehen. Icons and labels are readable and
  inside the round display; each quarter highlights and runs its own action once.
- [ ] The small hole shows HA's local clock, including leading zeros, and
  updates through a minute change. Before time sync it shows `--:--`.
  Taps on the clock hole, dividers or outside the circular page run no action.
- [ ] Temporarily replace one Licht quarter with `null`, then all four with
  `null`: empty quarters are dark and inert; the clock and navigation work.
- [ ] Swipe Licht → Klima → Papa and back. The active
  dot tracks the page; swiping past either end stays there. Neither navigation
  nor a touch spanning a Manifest replacement runs an Item's action.
- [ ] Apply the six-page variant: all pages are reachable by swiping, including
  mixed Single and both Pie forms. With only Licht, no page dots appear. A valid
  replacement starts at home; a seventh page is rejected and preserves the old one.
- [ ] On Papa, check Single's icon, label, colour, live value and press
  feedback. The large Item alone runs its action; the area around it is inert.
- [ ] On a plain Pie quarter or Single Item, cycle through all 44 names in
  [the icon list](manifest.md#compiled-in-icons), reloading between groups.
  Compare each glyph with [the icon mockup](mockups/icons.png); none is missing.
- [ ] Set an icon to `mdi:not-in-lunactl` in the Designer: validation rejects it,
  shows an error and leaves the saved Manifest and device unchanged. Omit
  `icon`: the valid Manifest autosaves and reloads; no icon appears, while the
  Item's label and action still work. Restore a known icon from the list.

## Live values and subscriptions (#5)

- [ ] On Klima, update the test temperature (for example 21.25) and
  `climate.kinderzimmer`'s `hvac_action` via the test integration or Developer
  Tools → States. Temperature rounds to one decimal with a comma; mapped
  `cooling`/`heating`/`idle` show Kühlen/Heizen/Aus. Changes appear without reload.
- [ ] Toggle `input_boolean.lunactl_papa_kommt`: Papa's Single value shows
  **Papa kommt** when on and clears when off. Update it while that page is hidden;
  navigating back shows the latest value. Its tap still runs Papa rufen.
- [ ] Copy Klima center's `value` onto a Licht quarter: plain Pie shows live
  values too. Missing, empty, unknown/unavailable and invalid numeric states
  show `--`; valid state recovery updates immediately. Restore the test states.
- [ ] Cold boot with the example and capture timestamps: initial fetch causes
  exactly one subscription reconnect, the next fetch settles and live values,
  timer attributes and brightness arrive. Measure from first HA connection to
  usable live values and record the delay; no repeating reconnect/reboot loop.
- [ ] Edit only value formatting or remove a reference: reload applies without
  restart. Add a new entity reference (for example `sensor.lunactl_check`) or a
  previously unused attribute to `value.refs` with a matching placeholder:
  reload requests a restart, then fetches and receives its state. Measure the
  delay until usable and record it. Repeated fetches then remain stable.
- [ ] Disconnect HA: the last values stay visible. Change a referenced state
  while disconnected, then reconnect: the device fetches again and shows the
  fresh state.

## Countdown on Single and Pie center (#6)

- [ ] Start the Klima-Lauf using Kühlen or Heizen. Klima's center shows label,
  live value, decreasing remaining time and ring together. Text updates every
  second without HA sending a new finish time each second.
- [ ] Restart the running Klima-Lauf: remaining time and ring reset to the new
  30 minutes. Tap the center: Klima aus runs once, switches off and cancels the
  timer, removing text/ring. It also works when the timer is idle.
- [ ] Apply the Single countdown variant (Papa `item.countdown` =
  `timer.kinderzimmer_klima_lauf`). Use HA `timer.start` with a short duration,
  for example `00:01:05`, so no appliance run is needed. Check start, restart,
  cancel, pause and resume on both Single and Pie center; labels/values remain
  readable and the ring never consumes the Item's action.
- [ ] Let a short timer expire: text/ring disappear without another action.
  Check the minute boundary (`1:00` to `59 s`), and an hour-long test duration
  (`1:00:00`). Idle, paused, unavailable/missing timer, invalid attributes and
  unsynced time show no countdown. Restore timer state/time after these tests.
- [ ] Put `countdown` on a plain Pie quarter: it remains tappable, without
  countdown text/ring. Reconnect while a timer runs: fresh state restores the
  correct remaining time. A disconnect keeps the ring counting down; no stale
  ring remains after cancel.

## Pie with center and curved labels (#7)

- [ ] Klima has a large center, Kühlen/Heizen on the upper curved quarters and
  dark/inert lower quarters. The center label, value and countdown fit together;
  quarter icons/values/countdowns and the center icon are not displayed.
- [ ] Apply the four-filled-quarter variant: all four curved labels, including
  lower ones and **Schlafen gehen**, are readable in the proper direction and
  colour. Short and long labels stay within their arcs. Each quarter and center
  runs only its own action once.
- [ ] Clock is readable in the top gap and updates. Tapping gaps between arcs,
  the annular gap outside the center, the clock and the countdown ring runs no
  action. Swipes still navigate without running Items.
- [ ] Reload through Pie with center → plain Pie → Single and back: no stale
  labels, arcs, icons, values or ring remain; each form's touch areas still match.

## Keys, lit and dark (#8)

- [ ] With the everyday example, Taste A short calls the household action:
  ceiling off selects Gemütlich, ceiling on selects Schlafen gehen. Taste B long
  calls Papa rufen. Taste A long and Taste B short only wake. Check from every page.
- [ ] For each of `a_short`, `a_long`, `b_short`, `b_long`, temporarily bind just
  that gesture to the test helper action. Repeat every test with a lit display
  and after timeout: press wakes immediately; short fires once on release before
  1 second; long fires once at about 1 second while held. Record timing.
- [ ] With both gestures bound for a key, hold beyond 1 second: no repeated long
  actions and no short action on release. With only long bound, a short press
  only wakes; with only short bound, a long hold only wakes. No fallback gesture.
- [ ] Remove `buttons`, then use `{}` and partial bindings: unbound gestures
  only wake. A reload clears removed bindings. A press spanning a binding change
  uses the action present at press time. Disconnect while held cancels its action;
  without HA or a valid Manifest no key can dispatch.

## Timeout, wake, home and brightness (#9)

- [ ] With `display.timeout: 10`, navigate away from home and wait: display
  goes dark after about 10 idle seconds. First touch wakes onto Licht without
  running an Item. Test wake with an Item tap and a swipe: each is consumed;
  the next touch performs its normal action/navigation.
- [ ] Holding a touch or key prevents sleep; releasing starts a fresh timeout.
  Shorten timeout to `2.5` and measure it, then omit `display` and try `{}`:
  defaults are 10 seconds and 70% brightness. Keys still wake and dispatch as
  checked above, including on **Keine Verbindung** and Disconnected (wake only).
- [ ] Change `input_number.lunactl_brightness` to 25, 70, 100 and a fractional
  percentage: brightness changes while awake. At 0 the display is dark even
  though awake; restore the helper from HA. Update brightness while asleep:
  it stays off and uses the latest value on wake.
- [ ] Temporarily reference a test sensor for brightness and try missing/empty,
  `unknown`, `unavailable`, nonnumeric and out-of-range states: fallback is 70%.
  Disconnect keeps the last percentage; reconnect restores the live one. Removing
  the brightness reference restores 70%. A new brightness reference restarts as
  in the subscription checks. Restore the original helper and timeout.

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
  readings cannot be achieved, record the failures for the human running #13.

## Disconnected (ADR 0006)

- [ ] With a Manifest shown, switch off the Wi-Fi access point (or block the
  device). After the API keepalive notices it (up to 150 s), the page, values,
  brightness and a running countdown stay; swipes still navigate.
  No `wifi-off` icon is visible yet.
- [ ] Tap an Item and press a bound key: nothing runs, no Item highlights, and
  `wifi-off` appears at the top center for about 3 s. An unbound key only wakes.
  On a Pie with center the icon covers the clock while visible.
- [ ] Stay disconnected for 10 minutes: `wifi-off` stays visible. After another
  20 minutes the device has not rebooted (uptime continues, Manifest still shown).
- [ ] Restore Wi-Fi: the icon disappears, fresh states arrive, the Manifest is
  fetched again and Items run actions. No action from the disconnected period is
  sent afterwards.
- [ ] Reboot without HA: **Keine Verbindung**, as before.

## Completion and coverage (#11)

The following maps every acceptance item in the device check ticket to this
checklist. Mark the final box only when every check above has a recorded pass;
record failures/skips with evidence and follow-up issue links instead.

| Device check #13 acceptance item | Checklist section |
| --- | --- |
| MAC fetch, Item tap, errors and reload (#3) | Fetch, actions, errors and reload |
| Pie without center, pages/dots and #34 icon rules (#4) | Pie without center, pages, icons and Single |
| Live updates, boot reconnect/new-subscription restart, measured delay (#5) | Live values and subscriptions |
| Countdown start, restart and cancel (#6) | Countdown on Single and Pie center |
| Pie center and readable curved labels (#7) | Pie with center and curved labels |
| All gestures including dark display (#8) | Keys, lit and dark |
| Timeout, wake-only touch, home, brightness (#9) | Timeout, wake, home and brightness |
| Battery level/hint below 20% (#10) | Battery |
| Full checklist passed (#11) | This completion gate and run record |

- [ ] Restore the adapted room example, household action bindings, timer state
  and display settings. Reboot and smoke-check Licht, Klima and Papa. Attach the
  completed run record and checklist results to #13. All checks passed on the
  stated firmware/HA versions, with no unexplained errors in the logs.
