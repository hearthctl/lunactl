# Live values

An Item on a Single or Pie page can include `value` alongside its label:

```json
"value": {
  "format": "{0} °C · {1}",
  "refs": [
    {"entity": "sensor.room_temperature", "decimals": 1, "decimal_comma": true},
    {"entity": "climate.room", "attribute": "hvac_action",
     "map": {"heating": "Heizen", "idle": "Aus"}}
  ]
}
```

`format` is a nonempty string. `{0}`, `{1}`, etc. refer to the zero-based
positions in the nonempty `refs` array. Placeholders may repeat or appear in any
order. Other text, including unknown placeholders, stays literal. State text and
map results are inserted once; they cannot introduce more placeholders.

Each reference requires an `entity` (`domain.object_id`). Without `attribute`,
it reads the entity's state. An optional nonempty `attribute` reads that attribute
instead. References may also contain:

- `decimals`: an integer from 0 to 6; rounds numeric states to that many fixed
  decimal places, including trailing zeros. Omission preserves the state text.
- `decimal_comma`: a boolean, default `false`; replaces the decimal point in a
  numeric state with a comma.
- `map`: an object from exact state strings to display strings. A matching entry
  takes precedence over numeric formatting. Unmapped text is preserved unless
  numeric formatting was requested.

Missing or empty states display `--`. `unknown` and `unavailable` also display
`--` unless explicitly mapped. Invalid, nonfinite or out-of-range numeric states
display `--` when numeric formatting is requested. Rounded negative zero displays
as zero. Expressions and household logic belong in HA template sensors.

The device collects unique `(entity, attribute)` subscriptions from every Item
on every page, including pages currently hidden, in first-appearance order.
Formatting options do not create additional subscriptions. The initial Manifest
registers them in RAM and closes the API sockets once, letting HA reconnect and
learn the subscriptions. A Manifest without references needs no extra connection.
Each subsequent HA connection fetches the Manifest again. State callbacks refresh
the visible values. Disconnected keeps the Manifest and the last states visible
until HA reconnects and resends them (ADR 0006).

A replacement that only changes formatting or uses a subset of the registered
subscriptions applies immediately. Removed subscriptions remain registered until
reboot because HA has no unsubscribe operation. A valid replacement needing a
new entity or attribute schedules a device restart; the next boot fetches it and
registers its complete subscription list. Invalid or stale Manifests preserve
the current Manifest and subscription list. Nothing is stored in flash.
