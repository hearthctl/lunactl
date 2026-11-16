# Tracer contract

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

The [JSON Schema](../../schema/manifest.schema.json) describes this tracer:
`schema: 1`, exactly one page with `type: single`, and its `item` with `label`,
`color` (`#RRGGBB`) and `action`. An action has an HA `action` name and optional
`target` and `data` objects. Unsupported fields and Page types are rejected.
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

Additional pages, icons, live values and countdowns belong to the following
issues. An invalid replacement is logged and leaves the current
valid Manifest active. Without HA the device shows **Keine Verbindung**;
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
