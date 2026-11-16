# On-device checklist

Manual checks on the real StopWatch. Run the sections touched by a change before it is merged.

Before you start:

- The firmware from this branch is flashed (`uvx esphome@2026.10.2 run esphome/lunactl.yaml`).
- The HA package from this branch is loaded in Home Assistant.
- HA shows the `lunactl` device as connected, with „Allow the device to perform Home Assistant actions“ enabled, and `uvx esphome@2026.10.2 logs esphome/lunactl.yaml` is running.

## Licht

- [ ] After boot the **Licht** page shows four tiles: **Hell**, **Lesen**, **Gemütlich**, **Schlafen gehen**. Each has its icon, colour and word, and all four sit fully inside the round display.
- [ ] One page dot is visible at the bottom edge.
- [ ] A tile visibly reacts while pressed.
- [ ] **Hell**: Decke and Bett at 100 %, neutral white.
- [ ] **Lesen**: Decke off, Bett at 80 % warm.
- [ ] **Gemütlich**: Decke and Bett at 80 % warm.
- [ ] **Schlafen gehen**: Decke off, Bett goes straight to 8 % warm, without a fade.
- [ ] **Taste A** with Decke off: **Gemütlich**.
- [ ] **Taste A** again, with Decke on: **Schlafen gehen**.
- [ ] Switch Decke on by other means (wall switch or HA app), then **Taste A**: **Schlafen gehen**.
- [ ] Switch Decke off by other means, then **Taste A**: **Gemütlich**.
- [ ] Holding **Taste A** for more than 1 s does nothing.
- [ ] The device log shows no errors for any of the above.
