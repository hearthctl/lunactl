# Manifest reference

Use [the room example](../examples/child-room.json) and
[household setup](household.md) to get started. The authoritative field shapes
are in [schema/manifest.v1.schema.json](../schema/manifest.v1.schema.json).
The Manifest is plain JSON without Jinja, at most 32 KiB. Unknown fields are
rejected at every defined level; `action.data` and value maps permit their own
keys. Omit optional fields rather than setting them to `null`. Pie quarters
accept `null` for an empty Slot; arbitrary data inside `action.data` can also
contain JSON null values.

## Top level

| Field | Required | Meaning |
| --- | --- | --- |
| `schema` | Yes | Integer `1`; unsupported versions are rejected and logged. |
| `pages` | Yes | Array of 1–6 Page type objects. First page is home. |
| `buttons` | No | Gesture names mapped directly to actions; omission or `{}` leaves all unbound. |
| `display` | No | Idle timeout and brightness entity; omission or `{}` uses defaults. |

Swipe left/right or tap a page dot to navigate. Swiping past the first/last page
stays there. A valid Manifest replacement and display sleep return to home.
An invalid replacement keeps the previous valid Manifest. See the
[contract](contracts/README.md) for fetch, connection and action behaviour.

## Page types and visible Item fields

| Page type | Shape and Slots | Visible fields and clock |
| --- | --- | --- |
| Single | `{"type":"single","item":{…}}`; one required Item. | Icon, label, colour, optional live value and countdown text/ring. No page clock. |
| Pie without `center` | `{"type":"pie","quarters":[…]}`; exactly four Items or `null`, clockwise: top-left, top-right, bottom-right, bottom-left. | Quarter icon, label, colour and live value. Small clock hole. No quarter countdown. |
| Pie with `center` | Same four `quarters`, plus `"center":{…}` with a full Item. `center: null` is invalid; omit it for the other Pie form. | Quarters show curved label and colour only. Center shows label, live value and countdown text/ring, without an icon. Clock in the top gap. |

A `null` quarter is dark and inert. The clock, dividers, gaps and countdown ring
are inert; tapping an Item runs its action. The Pie clock uses HA local time,
with `--:--` before time sync. Fields accepted on an Item but not shown by its
Page type still keep their references and subscriptions. Keep labels short and
check fit on the real round display; [mockups](mockups/README.md) show intent.

## Items and actions

| Item field | Required | Value |
| --- | --- | --- |
| `label` | Yes | Nonempty string. |
| `color` | Yes | Six-digit `#RRGGBB` string; quote it in YAML. |
| `action` | Yes | Full action object below; an Item is always tappable. |
| `icon` | No | HA MDI name from the schema enum (listed below); omission shows no icon, unknown names reject the Manifest. |
| `value` | No | Live value object below. |
| `countdown` | No | HA entity ID matching `timer.object_id`; rendered only in Single or Pie center. |

An Item's `action` and each key binding use the same object:

```json
{
  "action": "light.turn_on",
  "target": {"entity_id": ["light.bed", "light.ceiling"]},
  "data": {"brightness_pct": 40}
}
```

`action` is required and has the form `domain.action`, using lowercase letters,
digits and underscores. Optional `target` accepts only `entity_id`, `device_id`,
`area_id`, `floor_id` and `label_id`; each selector is a nonempty string or a
nonempty array of nonempty strings. Optional `data` is an object and may contain
nested objects, arrays and scalar values. Missing `target`/`data` become `{}`.
Both retain their structure through `lunactl.run`. HA validates whether
the selected action, target and data make sense. Conditional household logic
belongs in an HA script, not the Manifest.

## Live values and countdowns

`value` requires a nonempty `format` string and a nonempty `refs` array:

```json
{
  "format": "{0} °C · {1}",
  "refs": [
    {"entity": "sensor.room_temperature", "decimals": 1, "decimal_comma": true},
    {"entity": "climate.room", "attribute": "hvac_action", "map": {"idle": "Aus"}}
  ]
}
```

| Reference field | Meaning |
| --- | --- |
| `entity` | Required entity ID `domain.object_id` (lowercase letters, digits and underscores). Reads its state by default. |
| `attribute` | Optional nonempty attribute name to read instead of the state. |
| `decimals` | Optional integer 0–6, fixed numeric decimal places; omission preserves state text. |
| `decimal_comma` | Optional boolean, default `false`, uses a comma in numeric output. |
| `map` | Optional object mapping exact state strings to display strings, taking precedence over numeric formatting. |

Placeholders `{0}`, `{1}`, etc. refer to `refs` in zero-based order; repeats and
reordering work, unknown placeholders stay literal. Missing, empty, `unknown`
and `unavailable` states show `--` unless mapped. See [values.md](values.md) for
numeric fallbacks and the reconnect/restart subscription lifecycle.

`countdown` references a household-owned timer, for example
`"countdown":"timer.kinderzimmer_klima_lauf"`. For an active timer the device
uses `finishes_at` and `duration` and counts down locally every second. Single
and Pie center show remaining time and a ring alongside the label/value.
Restarting refreshes them; idle, paused, expired, unavailable or invalid timers,
or unsynced time, hide both. This does not change the Item's action or switch
off appliances. See [countdown.md](countdown.md) for timestamp/duration formats.

## Keys and display

`buttons` accepts only `a_short`, `a_long`, `b_short`, `b_long`, each containing
an action object. Taste A is yellow; Taste B is blue. Short runs on release
before 1 second, long runs once at about 1 second while held. A long release
never also runs short. Every key press wakes; bound gestures run even from a
dark display. An omitted gesture only wakes and does not fall back to another
binding. `null` is invalid. A replacement clears omitted bindings. Pending
presses retain the actions from press time; disconnect cancels them.

| Display field | Meaning |
| --- | --- |
| `timeout` | Idle seconds, number from 0.001 to 4294967.295 rounded to milliseconds, default 10. |
| `brightness` | Entity ID whose state is a percentage 0–100, including fractions; default brightness 70% when omitted or the state is missing/invalid. |

Holding a touch or key keeps the display awake. On sleep, brightness becomes
zero and the page returns home. The first touch only wakes, consuming its
release, swipe or page-dot selection. The next touch behaves normally. Keys
keep their actions when waking. Brightness updates apply immediately while
awake, or on the next wake while asleep. Missing/empty/unknown/unavailable,
nonnumeric, nonfinite or out-of-range brightness states use 70%. Disconnect
clears cached brightness. See the [contract](contracts/README.md) for details.

## Compiled-in icons

Use the exact, case-sensitive names below. The `item.icon` enum in the
[schema](../schema/manifest.v1.schema.json) is the source of truth for these
44 entries in [icons.h](../esphome/lunactl/icons.h), illustrated by the
[icon mockup](mockups/icons.png). Unknown names and empty strings are invalid.
An omitted icon leaves Single and Pie quarters showing only label and value,
with all other layout positions unchanged. `mdi:help-circle` is a normal icon,
available only when selected explicitly. Icons are built
into the firmware; arbitrary HA icons, URLs and uploaded images are unsupported.

| Group | Names |
| --- | --- |
| Light | `mdi:lightbulb`, `mdi:lightbulb-off`, `mdi:ceiling-light`, `mdi:lamp`, `mdi:desk-lamp`, `mdi:led-strip-variant`, `mdi:string-lights`, `mdi:white-balance-sunny` |
| Room | `mdi:book-open-variant`, `mdi:sofa`, `mdi:weather-night`, `mdi:bed`, `mdi:sleep`, `mdi:brightness-6`, `mdi:palette` |
| Climate | `mdi:snowflake`, `mdi:fire`, `mdi:thermometer`, `mdi:air-conditioner`, `mdi:fan`, `mdi:water-percent` |
| Actions | `mdi:power`, `mdi:timer-outline`, `mdi:plus-circle`, `mdi:stop-circle`, `mdi:hand-wave`, `mdi:bell-ring` |
| House | `mdi:home`, `mdi:door`, `mdi:window-closed`, `mdi:blinds` |
| Status | `mdi:check-circle`, `mdi:close-circle`, `mdi:wifi-off`, `mdi:battery-alert` |
| Other | `mdi:music`, `mdi:television`, `mdi:gamepad-variant`, `mdi:star`, `mdi:heart`, `mdi:alarm`, `mdi:calendar`, `mdi:robot-vacuum`, `mdi:help-circle` |
