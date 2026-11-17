# Home Assistant contract

For a complete room setup, use [household.md](../household.md) and the
[example Manifest](../../examples/child-room.json). This file describes the
reference scripts used by the current firmware. [ADR 0003](../adr/0003-manifeste-aus-dem-designer-in-ha.md)
plans their replacement by the Designer and HA integration (#35/#36); those
components are not implemented in this checkout yet.

Copy [scripts.yaml](scripts.yaml) into the household's Home Assistant scripts
(for example, `script: !include scripts.yaml` in `configuration.yaml`). Replace
the example MAC with the StopWatch's Wi-Fi MAC. Input MACs must use
colon-separated notation; the reference normalizes letter case to uppercase. Its example Item toggles
`input_boolean.lunactl_example`; create that helper in HA or replace the action.
Reload scripts after edits. Enable **Allow the device to perform Home Assistant
actions** in HA's ESPHome integration.

`script.lunactl_manifest(mac)` returns the Manifest itself as a response mapping,
not a JSON string or a `manifest` wrapper. An unmapped MAC returns `{}`. ESPHome
uses `capture_response: true`; its callback envelope exposes that mapping as
`response["response"]`. The Manifest must fit within 32 KiB. It is never saved
to device flash. Every HA API connection fetches it, and the device's
**Manifest neu laden** button fetches it again. Log viewers do not trigger a
fetch or make the device appear connected to HA.

The [JSON Schema](../../schema/manifest.v1.schema.json) accepts `schema: 1` and
one to six pages. The first page is home. Swipe left/right to move between pages,
or tap a page dot; swiping past either end stays on that page. A valid replacement
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
The 44 compiled-in MDI names match [the icon mockup](../mockups/icons.png).
Unknown names render `mdi:help-circle` and log a warning; an omitted icon uses
the same fallback without a warning. Unsupported fields and Page types are
rejected. Optional [live values](../values.md) and [countdowns](../countdown.md)
reference HA entities; the device subscribes to them and formats them locally.

The optional `display` object controls idle sleep and brightness:

```json
"display": {"timeout": 10, "brightness": "input_number.panel_brightness"}
```

`timeout` is idle seconds (default 10), from 0.001 to 4294967.295, rounded to
milliseconds. Touches and key presses reset inactivity; holding either keeps
the display awake until release. Sleep turns brightness off and returns to the
first page. The first touch after sleep only wakes: its release cannot run an
Item, swipe or select a page dot. The next touch works normally. Keys retain
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
action on release before 1 second. A long press runs once after 1 second while
held, and release does not also run the short action. Every press immediately
wakes the display, including unbound keys, and bound gestures still run when
the display was dark. Unbound gestures only wake; there is no fallback between
short and long. Each press uses the bindings present when it began; disconnect
cancels pending actions. Keys cannot dispatch without HA and a valid Manifest.
New Manifests replace all bindings, so omitted bindings clear previous ones.

An invalid replacement is logged and leaves the current valid Manifest active. Without HA the device shows **Keine Verbindung**;
connected without a valid Manifest it shows **Kein Manifest**. Neither state
can run an Item's action. Reconnecting refetches; the previous valid Manifest
stays in RAM until replaced. Rebooting always starts without a Manifest.

A tap or bound key gesture calls `script.lunactl_run` with exactly two string fields:

```json
{
  "action": "input_boolean.toggle",
  "data": "{\"target\":{\"entity_id\":\"input_boolean.lunactl_example\"},\"data\":{}}"
}
```

`data` is JSON text containing the original action's `target` and `data`.
Missing objects become `{}`. The reference script decodes this envelope and
passes both objects to HA without flattening targets or converting nested data
to strings. House logic stays in HA; the firmware only calls these two scripts.
Errors are logged and actions are not automatically retried.

The snippets here are the exact files loaded by `make check-contracts`.
