# Home Assistant contract

For installation through HACS, use [household.md](../household.md). The
integration owns Manifest storage and supplies the two firmware actions. Enable
**Allow the device to perform Home Assistant actions** in HA's ESPHome options.
MAC lookup uses HA's device registry and normalizes case and separators.

`lunactl.manifest(mac)` returns the Manifest itself as a response mapping,
not a JSON string or a `manifest` wrapper. An unmapped MAC returns `{}`. ESPHome
uses `capture_response: true` with a response template that serializes the
mapping into `response["response"]["manifest_json"]`. The core parses that JSON
text so parser errors such as `TooDeep` reach the display instead of being
discarded by ESPHome's envelope parser. The service still returns a mapping;
this transport template belongs to the firmware. The Manifest must fit within 32 KiB. It is never saved
to device flash. Every HA API connection fetches it, and the device's
**Manifest neu laden** button fetches it again. Log viewers do not trigger a
fetch or make the device appear connected to HA.

The [JSON Schema](../../schema/manifest.v1.schema.json) accepts `schema: 1` and
one to six pages. The first page is home. Swipe left/right to move between pages.
The white dot marks the active page. Swiping past either end stays on that page. A valid replacement
Manifest starts at home.

A `single` page has an `item`. A `pie` page has `quarters`: exactly four entries,
clockwise from top-left (top-left, top-right, bottom-right, bottom-left). Each is
an Item or `null` for a dark, inert quarter. Without `center`, the small hole
shows HA's local time (`--:--` before time sync). The clock hole and dividers
are inert. An optional `center` Item creates a large center with label, live
value and countdown ring, curved quarter labels and colour, and the clock in
the top gap. Center icons and quarter icons/values/countdowns are not displayed
in that form. See the [complete field and icon reference](../manifest.md).

Items require `label`, `color` (`#RRGGBB`) and `action`, with an optional `icon`.
An action has an HA `action` name and optional `target` and `data` objects.
The schema's `item.icon` enum is the source of truth for the 44 compiled-in MDI
names, illustrated by [the icon mockup](../mockups/icons.png). Unknown names
reject the Manifest like other invalid fields. Omitting `icon` shows no icon
in Single or Pie quarters; label/value positions and the rest of the layout
stay in place. `mdi:help-circle` remains available as a normal icon.
Unsupported fields and Page types are rejected by the firmware contract.
The Designer's stored document additionally accepts a managed AC page:
`{"type":"ac","id":"room","entity":"climate.room","minutes":30,"minimum":18,"maximum":26}`.
The ID is unique within the document and remains stable when editing the page.
Duration is 1–1440 minutes; numeric limits must be finite with minimum below maximum.
The integration validates and compiles these pages into ordinary Dial pages
before returning `lunactl.manifest`. The firmware schema and version remain
unchanged. `lunactl.ac(device_id, page_id, command)` resolves the saved settings;
commands are `cool`, `heat`, `off`, `minus` and `plus`. Generated display entities
and countdowns are shared per climate; see [managed AC-Dial](../household.md#managed-ac-dial).
Optional [live values](../values.md) and [countdowns](../countdown.md)
reference HA entities; the device subscribes to them and formats them locally.

The optional `display` object controls idle sleep and brightness:

```json
"display": {"timeout": 10, "brightness": "input_number.panel_brightness"}
```

`timeout` is idle seconds (default 10), from 0.001 to 4294967.295, rounded to
milliseconds. Touches and key presses reset inactivity; holding either keeps
the display awake until release. Sleep turns brightness off and returns to the
first page. The first touch after sleep only wakes: its release cannot run an
Item or change pages. The next touch works normally. Keys retain
their gesture behavior when waking.

`brightness` names an entity whose state is a percentage from 0 to 100, including
fractions. Omission, missing/empty states, `unknown`, `unavailable`, nonnumeric,
nonfinite and out-of-range values use 70%. The percentage is rounded to the
CO5300's 0–255 range. Updates apply immediately while awake and take effect on
wake while asleep. Disconnect clears the cached state and uses the fallback.
Brightness shares the [live-value subscription lifecycle](../values.md),
including deduplication, the initial reconnect and restart for a new entity.
Omitting `display` or using `{}` selects both defaults. Invalid display fields
reject the replacement and preserve the previous Manifest.

The optional `buttons` object binds `a_short`, `a_long`, `b_short` and `b_long`
directly to actions in that same format (for example,
`"buttons": {"b_long": {"action": "script.example"}}`). Omit a gesture to leave
it unbound; `{}` or an absent `buttons` leaves all gestures unbound. Unknown
gesture names, `null` bindings and malformed actions are rejected.

Taste A is the yellow key; Taste B is the blue key. A short press runs its
action on release before 3 seconds. A long press runs once after 3 seconds while
held, and release does not also run the short action. While a key whose long
gesture is bound is held, a bubble in the key's colour grows from 0.4 seconds
and pops when the long gesture runs; unbound or short presses show no bubble,
and a lost connection removes it. Every press immediately
wakes the display, including unbound keys, and bound gestures still run when
the display was dark. Unbound gestures only wake; there is no fallback between
short and long. Each press uses the bindings present when it began; disconnect
cancels pending actions. Keys cannot dispatch without HA and a valid Manifest.
New Manifests replace all bindings, so omitted bindings clear previous ones.

An invalid replacement is logged and leaves the current valid Manifest active.
Failure reasons appear only when there is no valid Manifest to show. Without HA
the device shows **Keine Verbindung**. While connected, an empty `{}` response
shows **Kein Manifest** with **Für dieses Gerät fehlt es** (also for an unmapped
MAC); an action error shows **Abruf fehlgeschlagen** with its error; an invalid
Manifest shows **Manifest abgelehnt** with the core's original validation or JSON
parser error, including `TooDeep` and unsupported schema versions. An unanswered
fetch shows **Abruf fehlgeschlagen** with **Keine Antwort von HA (Aktionen erlaubt?)**
after 10 seconds; HA can silently refuse actions when permission is disabled.
The German heading and up to 96 bytes of reason wrap in a centred 340 px label
using the 20 px font; longer reasons end in `...` without splitting UTF-8.
Full errors remain in the log. These states cannot run an Item's action.
Newer replies replace earlier reasons; stale replies cannot change them.
Reconnecting clears the reason and refetches; the previous valid Manifest
stays in RAM until replaced. Rebooting always starts without a Manifest.

A tap or bound key gesture calls `lunactl.run` with exactly two string fields:

```json
{
  "action": "input_boolean.toggle",
  "data": "{\"target\":{\"entity_id\":\"input_boolean.lunactl_example\"},\"data\":{}}"
}
```

`data` is JSON text containing the original action's `target` and `data`.
Missing objects become `{}`. The integration decodes this envelope and
passes both objects to HA without flattening targets or converting nested data
to strings. House logic stays in HA; the firmware calls these two integration actions.
Errors are logged and actions are not automatically retried.

`make verify` installs the actual integration into disposable HA 2026.9.3
under Podman and exercises the contract, including save/validate/delete.

## Internal API

The admin websocket API uses HA's `/api/websocket` authentication. Commands:

```json
{"id": 1, "type": "lunactl/devices"}
{"id": 2, "type": "lunactl/manifest/get", "device_id": "<HA device ID>"}
{"id": 3, "type": "lunactl/manifest/save", "device_id": "<HA device ID>", "revision": 0, "manifest": {"schema": 1, "pages": [{"type": "single", "item": {"label": "Test", "color": "#123456", "action": {"action": "light.turn_on"}}}]}}
```

`devices` returns the devices with manufacturer `hearthctl` and model `lunactl`.
`get` and `save` return `device_id`, `name`, `manifest`, `revision` (0 before the
first save), `online`, `firmware_version`, `schema_version`, `highest_schema`,
`required_firmware` (e.g. `2.0`) and `will_restart`. A save's `will_restart`
indicates new entity/attribute subscriptions compared with those fetched by the
device, or its previous Manifest before the first fetch observed by HA. New
subscriptions imply a restart and reset that baseline; removing references alone
retains subscriptions, matching the firmware core. Pass an optional `manifest` to `lunactl/manifest/get` to validate a proposed
change and preview `will_restart` without saving it. A read without a proposed
Manifest returns `will_restart: false`. Availability comes
from the device's ESPHome entity states, including the reload button.

A save validates against min(device firmware major, highest shipped schema),
then writes the lowest schema that accepts the content, checking each version
in order. The input `schema` must be an integer; its value is canonicalized.
Unparseable registry firmware versions refuse saving with `unknown_firmware`
(**Firmware-Version unbekannt**). Stale revisions fail with `stale_revision`
(**Manifest wurde inzwischen geändert**). Invalid content fails with
`invalid_manifest`. Errors preserve the current revision and Manifest.

A rollback never modifies stored content: `lunactl.manifest` returns it unchanged,
even if its required schema is newer than the device. Firmware logs and rejects
unsupported schemas. Every released schema is bundled with the HACS integration;
stored Manifests need no migration.

Saves persist before returning and debounce each device's reload button for
10 seconds. Offline reload attempts are dropped; reconnect fetches anyway.
Deleting a device deletes its Manifest. Registry renames rewrite defined entity
references and script action names in every Manifest, increment revisions and
use the same reload delay. Action `data` remains opaque. Missing entity, device,
area, floor and label references raise one repair issue per device, checked at
startup, on saves and registry/state changes; restoring references clears it.
