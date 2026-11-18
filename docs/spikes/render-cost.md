# Render cost after #75

Measured on the StopWatch over USB on 2026-11-18, with ESPHome 2026.10.2
and LVGL 9.5.0. This follows the temporary instrumentation in
[issue #71](https://github.com/hearthctl/lunactl/issues/71).
The build uses 80 MHz QSPI, the default buffer, no root corner clipping,
an unstyled touch surface, and quadrant containers around the Pie center arcs.

The [measurement log](render-cost.log) contains only performance events.

The fixed Manifest has Single, Pie and Pie with a center Item, with the same
labels, icons and colors as #71. HA callbacks and actions are disabled for
the measurement. LVGL refresh/flush events measure elapsed time and flushed
pixels. Ten forced full-screen refreshes per Page type give these medians:

| Page type | Full frame, render plus flush |
|---|---:|
| Single | 84.601 ms |
| Pie | 109.627 ms |
| Pie with center | 149.486 ms |

Synthetic taps on the device separately exercise the touch surface's pressed
state, Core press plus UI highlight, released state, and Core release plus
render_manifest. They do not measure touchscreen sampling or finger-to-panel
latency. Coordinates are (233, 233) for Single and (90, 90) for Pie.

| Page type | Highlight pixels | Highlight time | Release full frames |
|---|---:|---:|---:|
| Single | 79,524 | 33.873 ms | 1 |
| Pie | 52,900 | 23.826 ms | 1 |
| Pie with center | 54,756 | 61.313 ms | 1 |

Neither entering nor leaving the pressed state flushes pixels. Pie center's
highlight is confined to the quadrant; display rounding expands its 233 px
bounds to 234 px. Each tap produces exactly one full frame, on release.

The initial run also found unchanged battery labels being written every ten
seconds. Those writes now use the same text comparison as the clock and
countdown labels.

A second 35-second idle observation, with the display timeout extended to
120 seconds in the test Manifest, produced two redraws. Both followed logged
battery text changes (95% to 96% and back); the subsequent 21 seconds produced
no redraw despite two more battery polls. A later minute change redrew the
clock. There were no DMA TX underflows or transmit failures in either USB run.
The battery adapter regression test also verifies that an unchanged poll
performs zero label writes.

Host and schema tests, frontend tests, all 25 integration tests, and the
production firmware build passed. The temporary benchmark is not part of the
production configuration.

Physical inspection of all Page types and the round edge remains a separate
check: these measurements cannot establish what the panel looks like.
