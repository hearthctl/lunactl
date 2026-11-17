# Set up a household

Start with [examples/child-room.json](../examples/child-room.json). It contains
three pages in order: Licht (Pie, home), Klima (Pie with `center`), Papa
(Single), plus Taste A/B bindings and display settings. Page names here describe
their purpose; the Manifest has no page-name field. See the [Manifest field
reference](manifest.md), [contract](contracts/README.md) and
[on-device checklist](checklist.md).

These instructions describe the firmware currently in this repository, which
calls `script.lunactl_manifest` and `script.lunactl_run`.
[ADR 0003](adr/0003-manifeste-aus-dem-designer-in-ha.md) specifies the upcoming
Designer and required HA integration; their implementation is tracked in
[#35](https://github.com/hearthctl/lunactl/issues/35) and
[#36](https://github.com/hearthctl/lunactl/issues/36). They are not an installation
path for this firmware yet.

## 1. Prepare the household actions and entities

The example uses illustrative entity IDs. Replace them throughout the JSON with
your household's IDs, or create the following in your test HA. The Manifest
describes actions and references; it does not create entities or implement the
household logic. Test the actions in HA's Developer Tools before using the panel.

| Example entity/action | Household responsibility |
| --- | --- |
| `scene.kinderzimmer_hell` | Hell: ceiling and bed lights fully bright, neutral light. |
| `scene.kinderzimmer_lesen` | Lesen: bright warm light at the bed only. |
| `scene.kinderzimmer_gemuetlich` | Gemütlich: warm light at ceiling and bed. |
| `scene.kinderzimmer_schlafen_gehen` | Schlafen gehen: bed LEDs immediately dim and warm, other lights off. |
| `script.lunactl_taste_a` | Taste A: choose Schlafen gehen if the ceiling is already on, otherwise Gemütlich. The conditional lives in HA. |
| `script.lunactl_kuehlen`, `script.lunactl_heizen` | Start the respective Klima-Lauf for 30 minutes; another call restarts the 30 minutes. |
| `script.lunactl_klima_aus` | Switch the air conditioner off immediately regardless of who started it; cancel the Klima-Lauf. |
| `timer.kinderzimmer_klima_lauf` | Track the Klima-Lauf. Household automation must switch off the air conditioner when it finishes. The device only displays its remaining time. |
| `climate.kinderzimmer` | Provide the `hvac_action` attribute for the Klima value. Adjust the map if this device uses other states. |
| `sensor.kinderzimmer_temperatur` | Room temperature in °C, displayed with one decimal and a decimal comma. |
| `script.lunactl_papa_rufen` | Send Papa a normal phone notification. |
| `input_boolean.lunactl_papa_kommt` | Papa's reply: on displays **Papa kommt**; off displays no reply. Household automation handles setting and clearing it, including clearing a previous reply on a new call. |
| `input_number.lunactl_brightness` | Brightness percentage, helper range 0–100; start at 70. |

The example binds `a_short` to Taste A's household action and `b_long` to Papa
rufen. `a_long` and `b_short` are deliberately unbound and only wake the display.
The keys work from any page, including when the display is dark. The Klima
center always runs Klima aus, even when its countdown is hidden. The Papa Item
always runs Papa rufen, including while showing Papa kommt.

## 2. Install and map the contract scripts

Copy [contracts/scripts.yaml](contracts/scripts.yaml) into HA's scripts. For
example, use `script: !include scripts.yaml` in `configuration.yaml` and put the
two script definitions in that `scripts.yaml` (merge them into an existing file
if necessary). Do not add another `script:` wrapper to the included file.

The reference contains a minimal **Beispiel** Item for contract smoke checks. To
try it first, create `input_boolean.lunactl_example`. For the room example,
replace that Manifest under `sequence` → `variables` → `manifests` →
`"AA:BB:CC:DD:EE:FF"` with the contents of `examples/child-room.json`.
JSON objects are valid YAML values. From the repo root, this prints the room
Manifest indented to paste immediately below that MAC key, replacing its old
`schema` and `pages` block:

```sh
python3 - <<'PY'
import json
from pathlib import Path
manifest = json.loads(Path("examples/child-room.json").read_text())
print("\n".join(" " * 12 + line for line in json.dumps(manifest, ensure_ascii=False, indent=2).splitlines()))
PY
```

Replace the MAC key with the StopWatch's actual **Wi-Fi MAC**, as shown in its
ESPHome logs. Use colon-separated notation; the script uppercases incoming
MACs, so store the key uppercase. Keep the `manifest` lookup and `stop` response
steps after the mapping. Leave `lunactl_run` intact: it forwards each Item/key
action's full `target`/`data` envelope. Reload HA scripts after every edit.

In Developer Tools → Actions, call `script.lunactl_manifest` with `mac` set to
that Wi-Fi MAC and inspect its response. It must be the Manifest mapping itself,
with `schema`, `pages`, `buttons` and `display`, without a wrapper or JSON string.
An unmapped MAC returns `{}`. Schema validation checks the shape, not whether HA
entities and actions exist.

## 3. Flash and connect the StopWatch

Install the tools in [testing.md](testing.md). Copy
`esphome/secrets.example.yaml` to the gitignored `esphome/secrets.yaml` locally,
fill in Wi-Fi credentials, and generate your own API encryption key with
`openssl rand -base64 32`. From the repo root, flash with:

```sh
uvx esphome@2026.10.2 run esphome/lunactl.yaml
```

Add the device in HA's ESPHome integration using that API encryption key and
enable **Allow the device to perform Home Assistant actions** in the integration's
device options. The native API supplies the Manifest, live values and local time;
no HA token is needed on the device. Opening a log viewer alone is not an HA
connection. Watch logs with:

```sh
uvx esphome@2026.10.2 logs esphome/lunactl.yaml --no-states
```

The initial Manifest with entity references makes one extra API reconnect so HA
learns the subscriptions. After reconnect, Licht is home; swipe to Klima and
Papa or tap the page dots. Use HA's **Manifest neu laden** button after changing
the returned Manifest. Labels, colours, actions and formatting apply without a
reflash; a new entity/attribute reference needs a device restart, requested by
the firmware automatically. A reboot always fetches again; no Manifest persists
in device flash. See [values.md](values.md) for subscription details.

## 4. Verify the setup

Run `make verify` in this repo. It validates the actual example against the JSON
Schema, checks that the firmware core accepts it, enforces the 32 KiB size limit,
runs the firmware tests and compiles ESPHome with example secrets. It neither
contacts your household HA nor proves physical display/touch behaviour.

Then perform [checklist.md](checklist.md) in a test HA on the StopWatch and record
the results for [#13](https://github.com/hearthctl/lunactl/issues/13). Its temporary
Manifest variants cover behaviours that the everyday three-page example does
not exercise. The current contract scripts are also exercised in a disposable
HA by CI's `make e2e`; see [testing.md](testing.md).

If the panel shows **Keine Verbindung**, check Wi-Fi, HA's ESPHome connection
and the API encryption key. **Kein Manifest** after connecting means no valid
Manifest was fetched: check script installation, action permission, the MAC
mapping and rejection/error logs. An invalid replacement keeps the previous
valid Manifest. Missing values show `--`; a hidden countdown can mean an inactive
timer or unsynced HA time. See [values.md](values.md) and [countdown.md](countdown.md)
for all fallback states. Failed actions are logged and are not retried.
