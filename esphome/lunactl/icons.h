#pragma once
#include <string>

namespace lunactl {
struct Icon { const char *name; const char *glyph; };
// Material Design Icons v7.4.47; names follow schema/manifest.v1.schema.json.
inline constexpr Icon ICONS[] = {
  {"mdi:lightbulb", "\U000F0335"},
  {"mdi:lightbulb-off", "\U000F0E4F"},
  {"mdi:ceiling-light", "\U000F0769"},
  {"mdi:lamp", "\U000F06B5"},
  {"mdi:desk-lamp", "\U000F095F"},
  {"mdi:led-strip-variant", "\U000F1051"},
  {"mdi:string-lights", "\U000F12BA"},
  {"mdi:white-balance-sunny", "\U000F05A8"},
  {"mdi:book-open-variant", "\U000F14F7"},
  {"mdi:sofa", "\U000F04B9"},
  {"mdi:weather-night", "\U000F0594"},
  {"mdi:bed", "\U000F02E3"},
  {"mdi:sleep", "\U000F04B2"},
  {"mdi:brightness-6", "\U000F00DF"},
  {"mdi:palette", "\U000F03D8"},
  {"mdi:snowflake", "\U000F0717"},
  {"mdi:fire", "\U000F0238"},
  {"mdi:thermometer", "\U000F050F"},
  {"mdi:air-conditioner", "\U000F001B"},
  {"mdi:fan", "\U000F0210"},
  {"mdi:water-percent", "\U000F058E"},
  {"mdi:power", "\U000F0425"},
  {"mdi:timer-outline", "\U000F051B"},
  {"mdi:plus-circle", "\U000F0417"},
  {"mdi:stop-circle", "\U000F0666"},
  {"mdi:hand-wave", "\U000F1821"},
  {"mdi:bell-ring", "\U000F009E"},
  {"mdi:home", "\U000F02DC"},
  {"mdi:door", "\U000F081A"},
  {"mdi:window-closed", "\U000F05AE"},
  {"mdi:blinds", "\U000F00AC"},
  {"mdi:check-circle", "\U000F05E0"},
  {"mdi:close-circle", "\U000F0159"},
  {"mdi:wifi-off", "\U000F05AA"},
  {"mdi:battery-alert", "\U000F0083"},
  {"mdi:music", "\U000F075A"},
  {"mdi:television", "\U000F0502"},
  {"mdi:gamepad-variant", "\U000F0297"},
  {"mdi:star", "\U000F04CE"},
  {"mdi:heart", "\U000F02D1"},
  {"mdi:alarm", "\U000F0020"},
  {"mdi:calendar", "\U000F00ED"},
  {"mdi:robot-vacuum", "\U000F070D"},
  {"mdi:help-circle", "\U000F02D7"},
};
inline const Icon *resolve_icon(const std::string &name) {
  for (const auto &icon : ICONS) if (name == icon.name) return &icon;
  return nullptr;
}
inline const char *icon_glyph(const std::string &name) {
  const auto *icon = resolve_icon(name);
  return icon ? icon->glyph : "";
}
}  // namespace lunactl
