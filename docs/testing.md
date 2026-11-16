# Tracer checks

Requirements: Go as specified by `go.mod`, a C++17 compiler (`CXX`), curl,
sha256sum, uv, and Podman. The host uses the same pinned ArduinoJson version as
ESPHome; `make` downloads and checks its header in `.build/`.

Run from the repository root:

```sh
make check-core       # seam 1: C++ host, Go tables and golden snapshots
make check-schema     # seam 2: valid/invalid Manifests, schema/core agreement
make check-contracts  # seam 3: disposable HA, reference scripts and host → action
make check-firmware  # ESPHome config and ESP32-S3 compile with example secrets
# Or all four:
make check
```

The contract runner creates its own local HA and test user, runs the Go tests,
and removes its container on exit. No household URL, credentials, entities or
packages are used. `PODMAN` can select a different Podman command, and
`HA_TEST_PORT` changes the default local port 18123. It deliberately fails if HA
cannot start; unavailable infrastructure does not count as a passing check.

Golden cases cover a single Item and tap, UTF-8/nested action data, missing
target/data, reload success, invalid replacement, initial errors, disconnect,
and stale replies from old connections or overlapping reloads. Size cases
exercise the 32 KiB boundary. Schema cases cover missing/unknown fields, types,
version, page count, colour, actions and targets. Pie golden cases cover all four
Slot actions, dark/inert empty quarters, clock formatting and invalid time, the
clock hole/dividers, all 44 icon names and glyphs, unknown-icon warnings and
fallback actions. Mixed-page cases cover six pages, dots, bounded swipes, home
on replacement, and cancellation of a touch spanning a Manifest replacement.
Schema cases accept sparse/full/empty Pie pages, mixed pages and optional or
unknown icons; they reject invalid quarter counts/Items/icons, a seventh page
and the deferred `center` field, with schema/core agreement. Contract cases
fetch by MAC,
feed the returned Manifest through the C++ host and execute its tap through
`lunactl_run`, and check target/data forwarding and failures in real HA.

Issue [#3](https://github.com/hearthctl/lunactl/issues/3) is verified by the three
automated seams above and `make check-firmware`. On-device acceptance belongs to
issue [#13](https://github.com/hearthctl/lunactl/issues/13): compilation and host
tests cannot verify display, touch or the native API on hardware. For that issue,
run [the device checklist](checklist.md) and record the firmware commit and
observations before declaring device acceptance.
