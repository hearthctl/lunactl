#include "../esphome/lunactl/core.h"
#include "../esphome/lunactl/battery.h"
#include <iostream>

static void item_view(JsonObject out, const lunactl::Item &item) {
  out["label"] = item.label;
  out["color"] = item.color;
  out["icon"] = item.icon;
  out["glyph"] = lunactl::resolve_icon(item.icon.c_str()).glyph;
}

// One JSON line per scenario: {"events": [...]}; one snapshot per event.
// Responses may name an earlier request to exercise connection/reload races.
int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    JsonDocument input, output;
    if (deserializeJson(input, line, DeserializationOption::NestingLimit(64))) return 1;
    lunactl::Core core;
    lunactl::Battery battery;
    bool battery_seen = false;
    bool display_on = true;
    uint32_t request = 0;
    auto snapshots = output["snapshots"].to<JsonArray>();
    for (JsonObjectConst event : input["events"].as<JsonArrayConst>()) {
      std::string type = event["type"].as<std::string>();
      std::string error;
      int tapped = -1;
      lunactl::ButtonEvent button_event;
      if (type == "connect") core.set_connected(true);
      else if (type == "disconnect") core.set_connected(false);
      else if (type == "fetch") request = core.begin_fetch();
      else if (type == "manifest") {
        auto token = event["request"].isNull() ? request : event["request"].as<uint32_t>();
        if (event["raw"].is<const char *>()) core.accept_json(token, event["raw"].as<std::string>(), error);
        else core.accept(token, event["manifest"], error);
      } else if (type == "time") {
        core.set_time(event["hour"] | -1, event["minute"] | -1, event["valid"] | true);
      } else if (type == "page") core.show_page(event["index"].as<size_t>());
      else if (type == "press") core.press(event["x"], event["y"]);
      else if (type == "release") tapped = core.release(event["x"], event["y"]);
      else if (type == "tap") {
        if (event["x"].isNull()) tapped = core.slot_tappable(0) ? 0 : -1;
        else {
          core.press(event["x"], event["y"]);
          tapped = core.release(event["x"], event["y"]);
        }
      } else if (type == "button") {
        std::string key = event["key"].as<std::string>();
        if (key != "a" && key != "b") return 2;
        button_event = core.button(key == "a" ? lunactl::Key::A : lunactl::Key::B,
                                   event["pressed"].as<bool>(), event["now"].as<uint32_t>());
        if (button_event.wake) display_on = true;
      } else if (type == "battery") {
        battery_seen = true;
        size_t index = 0;
        auto reads = event["reads"].as<JsonArrayConst>();
        battery.poll([&](uint8_t reg, uint8_t *data, size_t length) {
          if (index >= reads.size()) return false;
          auto read = reads[index++];
          if (read["reg"] != reg || read["bytes"].size() != length) return false;
          for (size_t i = 0; i < length; ++i) data[i] = read["bytes"][i].as<uint8_t>();
          return true;
        });
      } else if (type == "sleep") display_on = false;
      else if (type != "error") return 2;
      auto snapshot = snapshots.add<JsonObject>();
      snapshot["status"] = core.status();
      snapshot["tappable"] = core.tappable();
      if (battery_seen) {
        snapshot["battery"]["level"] = battery.level();
        snapshot["battery"]["text"] = battery.text();
        snapshot["battery"]["hint"] = battery.hint();
      }
      if (type == "fetch") snapshot["request"] = request;
      if (!error.empty()) snapshot["error"] = error;
      if (type == "manifest" && !core.warnings().empty()) {
        auto warnings = snapshot["warnings"].to<JsonArray>();
        for (const auto &warning : core.warnings()) warnings.add(warning);
      }
      if (type == "button" || type == "sleep") snapshot["display_on"] = display_on;
      if (type == "button") snapshot["wake"] = button_event.wake;
      const lunactl::Action *action = nullptr;
      if (!button_event.action.action.empty()) action = &button_event.action;
      if (core.tappable()) {
        snapshot["page"] = core.page_index();
        snapshot["home"] = core.page_index() == 0;
        auto dots = snapshot["dots"].to<JsonArray>();
        if (core.page_count() > 1)
          for (size_t i = 0; i < core.page_count(); ++i) dots.add(i == core.page_index());
        snapshot["type"] = core.pie() ? "pie" : "single";
        if (core.pie()) {
          snapshot["clock"] = core.clock();
          snapshot["hole_radius"] = 56;
          auto quarters = snapshot["quarters"].to<JsonArray>();
          for (size_t slot = 0; slot < 4; ++slot) {
            auto quarter = quarters.add<JsonObject>();
            quarter["tappable"] = core.slot_tappable(slot);
            if (core.slot_tappable(slot)) item_view(quarter, core.item(slot));
            else quarter["color"] = "#202020";
          }
        } else item_view(snapshot["item"].to<JsonObject>(), core.item());
        if (tapped >= 0) action = &core.item(tapped);
      }
      if (action != nullptr) {
        snapshot["call"]["service"] = "script.lunactl_run";
        snapshot["call"]["action"] = action->action;
        snapshot["call"]["data"] = action->data;
      }
    }
    serializeJson(output, std::cout);
    std::cout << '\n';
  }
}
