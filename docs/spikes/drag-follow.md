# Drag-follow on ESPHome

The StopWatch prototype established that native LVGL scrolling with cached RGB565
pages follows the finger well with the actual lunactl Single and Pie widgets.
The user described the cached variant as very smooth, with no flashing when
switching back to live widgets. UIFlow is not required for this interaction.

The prototype source and measurements are archived locally in
`.build/drag-follow-prototype`, branch `spike/drag-follow`, commit `f2998c3`.
The live-widget and cached measurements used separate manual gestures, not
matched trajectories. Snapshot preparation happened at startup in that prototype.

## Firmware integration

`Pager` owns the scroll container, up to six UI instances and their snapshots.
Core remains responsible for page selection, hit testing and actions. The core
page changes only after release, no active scroll animation and an exact page
offset. Touching a settling animation cannot trigger an action on the old page.
Moving beyond the tap tolerance permanently cancels the contact's action, even
when the finger returns to its starting position. Native scroll start also cancels
it. A dark-screen touch only wakes the display.

Snapshots are clipped to the circular page boundary with black corners. LVGL
corner clipping is enabled only during snapshot creation, so it does not add
masking work to each cached swipe frame.

Snapshots are invalidated by changes in rendered page content. Unchanged HA
updates do not rebuild them. One dirty page is captured per idle timer turn;
no captures or live-content updates occur during a contact/scroll. When all
page caches are ready, scrolling uses those images; otherwise it uses live
widgets. On settling, live widgets return and deferred values/clock/countdowns
are applied. Each 466x466 RGB565 snapshot uses 434312 bytes, plus metadata.
Allocation failure falls back to live scrolling and retries on a content change.

Manifest changes, disconnect/reconnect, sleep and explicit page changes invalidate
the current gesture. Removed pages release their snapshots. Core revision checks
and waiting for release prevent an old contact from acting on a new manifest.

## Validation

Core golden cases cover reversal, vertical movement, cancellation and small tap
jitter. The Pager adapter test exercises actual production C++ against an LVGL
state stub: delayed page selection, cache/live transitions, deferred live values,
manifest replacement, disconnect/reconnect and wake-only contact. Existing
firmware adapter and schema tests pass. The ESPHome 2026.10.2 build checks real
LVGL API signatures. The integrated firmware was flashed with hash verification
and connected to Home Assistant. The user confirmed the integrated firmware is fluid enough and deliberate taps
trigger the intended actions while swipes do not. Physical verification of
live-update and manifest-replacement edge cases remains pending.
