# Countdown

An Item can reference a Home Assistant timer:

```json
{
  "label": "Papa rufen",
  "icon": "mdi:bell-ring",
  "color": "#BB1260",
  "action": {"action": "script.example"},
  "countdown": "timer.example"
}
```

`countdown` is an optional `timer.object_id` string. Single displays the
remaining time below the label and optional live value, with a ring around the
Item. A Pie `center` Item shows the label above the remaining time, the optional
live value below it, and the same ring around the Item. Pie quarters accept the reference but do not display a countdown.
The Item keeps its action whether or not the timer is running.

The device subscribes to the timer's state, `finishes_at` and `duration`, sharing
the [live value subscription lifecycle](values.md) and deduplicating references
across all pages. No timer actions or household logic are added by the firmware.

For an `active` timer, remaining time is `finishes_at` minus HA's synced current
timestamp. It updates locally every second without further state messages.
The ring shows remaining time divided by `duration`, clamped to a full ring
when the timer is extended. Restarting or changing the timer updates both.
Positive fractional seconds round up for the text: below a minute it shows
`42 s`, then `1:30`, or `1:01:01` for an hour or more.

`finishes_at` accepts HA's ISO timestamp with `Z` or an explicit UTC offset and
optional fractional seconds. `duration` accepts `H:MM:SS`, including HA's
`1 day, H:MM:SS` / `2 days, H:MM:SS` forms and fractional seconds.
Timezone offsets are applied independently of the displayed local clock.

Idle, paused, unknown, unavailable, missing or unexpected states show no
countdown text or ring. Neither do expired timers, invalid/missing attributes,
nonpositive durations or an unsynced clock. Disconnected keeps the timer
states and counts down locally; reconnect refreshes them.
