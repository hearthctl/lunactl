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
version, page count, colour, actions and targets. Contract cases fetch by MAC,
feed the returned Manifest through the C++ host and execute its tap through
`lunactl_run`, and check target/data forwarding and failures in real HA.

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
