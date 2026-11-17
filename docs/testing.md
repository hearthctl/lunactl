# Tracer checks

Requirements: Go as specified by `go.mod`, a C++17 compiler (`CXX`), curl,
sha256sum and uv; `make e2e` also needs Podman. The host uses the same pinned
ArduinoJson version as ESPHome; `make` downloads and checks its header in
`.build/`.

Run from the repository root:

```sh
make check-core       # seam 1: C++ host, Go tables and golden snapshots
make check-schema     # seam 2: valid/invalid Manifests, schema/core agreement
make check-contracts  # seam 3: disposable HA, integration and host → action
make check-firmware   # ESPHome config and ESP32-S3 compile with example secrets
make check-integration # HA storage, lifecycle and websocket API
make check-hassfest   # integration metadata and translations: needs Podman
make verify           # core, schema, integration and firmware: needs no infrastructure
make e2e              # hassfest and contracts: need Podman
```

The contract runner creates its own local HA and test user, installs the actual
integration with isolated test registry fixtures, runs the Go and websocket tests,
and removes its container on exit. No household URL, credentials, entities or
packages are used. `PODMAN` can select a different Podman command, and
`HA_TEST_PORT` changes the default local port 18123. It deliberately fails if HA
cannot start; unavailable infrastructure does not count as a passing check.

Plain `make` runs `make verify`.

`make verify` must pass before a pull request is opened, and it must run without
a container runtime: agent pods have none. A check that needs Podman belongs in
`make e2e`, which CI runs after `make verify` on every pull request.

For issue [#11](https://github.com/hearthctl/lunactl/issues/11),
`TestManifestSchemaAndCoreAgree/child-room-example` reads the actual
[`examples/child-room.json`](../examples/child-room.json), enforces the 32 KiB
limit, validates it against the schema and checks firmware-core acceptance.
It runs in `make verify`. Review [household.md](household.md) and
[manifest.md](manifest.md) against the schema and current contract when changing
the example. The [checklist](checklist.md) maps every #13 criterion to physical
checks, including temporary variants for behaviours outside the daily example.
Completing those unchecked hardware results is the separate device ticket.

`make verify` must pass before a pull request is opened. `make e2e` is also available separately. CI's check named `verify` runs
`make verify` and then `make e2e` on the pull request merged on top of the
current base branch. It must be green before a merge.

Golden cases cover a single Item and tap, UTF-8/nested action data, missing
target/data, reload success, invalid replacement, initial errors, disconnect,
and stale replies from old connections or overlapping reloads. Size cases
exercise the 32 KiB boundary. Schema cases cover missing/unknown fields, types,
version, page count, colour, actions and targets. Pie golden cases cover all four
Slot actions, dark/inert empty quarters, clock formatting and invalid time, the
clock hole/dividers, all 44 icon names and glyphs, unknown-icon rejection and
omitted icons in Single and Pie quarters. A schema sync test runs every enum
name through the host and checks the compiled icon count. Mixed-page cases
cover six pages, dots, bounded swipes, home on replacement, and cancellation
of a touch spanning a Manifest replacement.
The touch adapter test compiles the production YAML press/release lambdas and
checks quarter taps, inert areas, swipes, page dots and replacement cancellation
with ESPHome's widget-relative point argument. The firmware build verifies the
generated callback signatures.
Schema cases accept sparse/full/empty Pie pages, mixed pages and optional or
known icons; they reject unknown icons, invalid quarter counts/Items/icons and
a seventh page, with schema/core agreement. Contract cases fetch by MAC, feed
the returned Manifest through the C++ host and execute its tap through
`lunactl.run`, and check target/data forwarding and failures in real HA.

Issue [#7](https://github.com/hearthctl/lunactl/issues/7) adds `pie-center`,
`pie-center-countdown`, `pie-center-reload` and `pie-center-subscriptions`
goldens. They check all five Slot actions and full center action data, curved
quarter labels and colour without icons or values, the large center's label,
live value and countdown, clock formatting in the top gap, empty quarters,
inert gaps/ring/outside touches, navigation, replacement cancellation and
subscription deduplication across hidden centers. Countdown cases cover local
ticking, restart, pause, cancel, expiry, unsynced time and disconnect clearing.
Schema/core agreement reuses the Item, value and countdown validation cases for
`center`, accepting an omitted center and rejecting null or malformed Items.
Production adapter checks exercise center touch/action dispatch and the actual
UI's arc geometry, label direction, colour, fonts, clock, live updates and
transitions between both Pie forms and Single. `make verify` runs these checks
and compiles the firmware with arc labels and A8 glyph transforms enabled.

Issue [#8](https://github.com/hearthctl/lunactl/issues/8) adds a golden file per
gesture (`button-a-short`, `button-a-long`, `button-b-short`, `button-b-long`),
each with lit and dark display cases. They verify no action on press, short on
release at 999 ms, long at 1000 ms while held, no repeat or short after long,
and the full action payload. Further golden cases cover absent, empty and
partial bindings, simultaneous keys, millis wraparound, offline cancellation
and atomic reload/replacement. `sleep` is a host fixture for a dark display;
automatic timeout is also exercised by the display cases below. The production
adapter test
compiles the actual YAML polling, wake and action lambdas with display stubs,
checking key mapping, wake and dispatch. Schema/core agreement cases validate
all four bindings with the shared action/target/data cases. Contract tests run
each bound gesture from a dark display through the host and `lunactl.run` in
disposable HA. Run `make verify` and `make e2e` for these checks and the firmware compile.

Issue [#9](https://github.com/hearthctl/lunactl/issues/9) adds `display-defaults`,
`display-timeout` and `display-brightness` golden cases. They check the 10-second
and 70% defaults, an empty `display`, a custom fractional timeout, the exact
sleep boundary, return to home, wake-only taps/swipes/page dots, subsequent Item
actions, held touches/keys, offline wake and millis wraparound. Brightness cases
check fractional and 0/100% states, missing/empty/unknown/unavailable, invalid and
nonfinite numbers, out-of-range fallbacks, updates during sleep, disconnect,
reconnect, removal and invalid/stale replacements. Subscription cases check the
initial reconnect and restart for a new brightness entity; the production
subscription adapter also checks deduplication with Item references. Display
adapter tests compile the actual YAML polling, touch and brightness lambdas,
checking wake consumption, live rendering, fallback on disconnect, the initial
70% setting and suppression of unchanged display commands. Schema/core agreement
covers display types, bounds, entity names and unknown fields. All run in
`make verify`, including the ESPHome configuration and ESP32-S3 compile.

Issue [#5](https://github.com/hearthctl/lunactl/issues/5) adds `value-*` golden
cases for the [value contract](values.md): repeated/reordered and multi-digit
placeholders, entity states and attributes, decimals, decimal comma, exact maps,
UTF-8, missing/unavailable and invalid numeric states, and live updates across
Single and Pie pages. Subscription goldens verify deduplication across hidden
pages, the single boot reconnect, cache clearing on disconnect, retained
subscriptions on removal, and restart for new entities or attributes. Invalid
replacements preserve the Manifest and subscriptions. Schema/core agreement
checks the optional value fields and their invalid forms on both Page types.
The production-adapter test compiles the actual subscription lambda and exercises
registration, callback-driven rendering, socket closure and restart. All run in
`make verify`, including the ESPHome compile. Reconnect timing on hardware remains
part of issue #13.

Issue [#6](https://github.com/hearthctl/lunactl/issues/6) adds `countdown-*`
goldens for active, idle, paused, unknown, unavailable and missing timer states;
local ticking, restart, cancel, expiry and unchanged Item actions; UTC offsets,
fractional seconds, long durations and malformed attributes; subscription
deduplication across hidden pages, disconnect/reconnect and Manifest replacement.
Schema/core agreement cases check timer references on both Page types. The
production adapter test compiles the actual subscription and one-second time
lambdas with the Single UI, observing remaining text, ring progress, clearing,
and the simultaneous label and live value. `make verify` runs all these checks
and compiles the firmware with its declared LVGL arc. The [countdown
contract](countdown.md) defines formatting and hidden states. On-device start,
restart and cancel checks remain part of issue #13.

Issue [#3](https://github.com/hearthctl/lunactl/issues/3) is verified by the three
automated seams above and `make check-firmware`. On-device acceptance belongs to
issue [#13](https://github.com/hearthctl/lunactl/issues/13): compilation and host
tests cannot verify display, touch or the native API on hardware. For that issue,
run [the device checklist](checklist.md) and record the firmware commit and
observations before declaring device acceptance.

Issue [#10](https://github.com/hearthctl/lunactl/issues/10) adds battery golden
cases to `make check-core`: M5PM1 VBAT byte order, equal levels on USB and
battery, empty/full bounds, 19/20/21% hint transitions, absent battery, invalid
voltages, transient NACKs, failed reads and recovery. The production-adapter
test also compiles the actual sensor and LVGL lambdas, checking the PMIC address,
bounded retries, unknown sensor state and clearing stale text after failure.
`make check-firmware` validates their ESPHome integration. Actual voltage
plausibility and PMIC reliability on hardware remain part of issue #13.

The level is an approximate voltage estimate, linearly mapping 3.3–4.2 V to
0–100%, clamped at either end. It uses the battery voltage even with USB
connected; charging voltage can raise the estimate. It is not a fuel gauge.
The [M5PM1 manual](https://m5stack-doc.oss-cn-shenzhen.aliyuncs.com/1207/M5PM1_Datasheet_CN.pdf)
documents PWR_SRC at 0x04 and VBAT_L/H at 0x22/0x23 in millivolts. The sensor
polls every 10 seconds and retries up to three times. Invalid data, missing BAT
or exhausted I2C retries publish an unknown level and clear the hint; the next
successful poll recovers without restarting.

Issue [#35](https://github.com/hearthctl/lunactl/issues/35) adds HA 2026.9.3
integration tests for persistence and failed writes, invalid/stale saves,
per-device debounce boundaries and offline drops, registry deletion and renames
(including script actions and opaque action data), repair issues across every
reference registry, firmware older/equal/newer than the integration, unknown
versions, lowest-schema stamping, rollback fetches, availability and restart
prediction. A synthetic additive v2 exercises version drift without releasing
an unneeded schema. Packaging tests compare every bundled schema byte-for-byte
and tie firmware project major to the core's highest accepted schema. Hassfest
validates metadata, action descriptions and English/German translations.
All run through `make verify` with the firmware compile and Podman contracts.

`HASSFEST` can override the hassfest command (for example, to supply emulation
on ARM hosts; the official image is amd64). `PODMAN` selects the contract runtime.
These overrides must still run the validator and disposable HA; they do not
skip checks.
