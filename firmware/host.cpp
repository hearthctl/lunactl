#include "../esphome/lunactl/core.h"
#include "../esphome/lunactl/battery.h"
#include <iostream>

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
    uint32_t request = 0;
    bool display_on = true;
    auto snapshots = output["snapshots"].to<JsonArray>();
    for (JsonObjectConst event : input["events"].as<JsonArrayConst>()) {
      std::string type = event["type"].as<std::string>();
      std::string error;
      lunactl::ButtonEvent button_event;
      if (type == "connect") core.set_connected(true);
      else if (type == "disconnect") core.set_connected(false);
      else if (type == "fetch") request = core.begin_fetch();
      else if (type == "manifest") {
        auto token = event["request"].isNull() ? request : event["request"].as<uint32_t>();
        if (event["raw"].is<const char *>()) core.accept_json(token, event["raw"].as<std::string>(), error);
        else core.accept(token, event["manifest"], error);
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
      else if (type != "tap" && type != "error") return 2;
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
      if (type == "button" || type == "sleep") snapshot["display_on"] = display_on;
      if (type == "button") snapshot["wake"] = button_event.wake;
      const lunactl::Action *action = nullptr;
      if (!button_event.action.action.empty()) action = &button_event.action;
      if (core.tappable()) {
        snapshot["item"]["label"] = core.item().label;
        snapshot["item"]["color"] = core.item().color;
        if (type == "tap") action = &core.item();
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
