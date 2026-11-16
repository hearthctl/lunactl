#include "../esphome/lunactl/core.h"
#include <iostream>

// One JSON line per scenario: {"events": [...]}; one snapshot per event.
// Responses may name an earlier request to exercise connection/reload races.
int main() {
  std::string line;
  while (std::getline(std::cin, line)) {
    JsonDocument input, output;
    if (deserializeJson(input, line, DeserializationOption::NestingLimit(64))) return 1;
    lunactl::Core core;
    uint32_t request = 0;
    auto snapshots = output["snapshots"].to<JsonArray>();
    for (JsonObjectConst event : input["events"].as<JsonArrayConst>()) {
      std::string type = event["type"].as<std::string>();
      std::string error;
      if (type == "connect") core.set_connected(true);
      else if (type == "disconnect") core.set_connected(false);
      else if (type == "fetch") request = core.begin_fetch();
      else if (type == "manifest") {
        auto token = event["request"].isNull() ? request : event["request"].as<uint32_t>();
        if (event["raw"].is<const char *>()) core.accept_json(token, event["raw"].as<std::string>(), error);
        else core.accept(token, event["manifest"], error);
      } else if (type != "tap" && type != "error") return 2;
      auto snapshot = snapshots.add<JsonObject>();
      snapshot["status"] = core.status();
      snapshot["tappable"] = core.tappable();
      if (type == "fetch") snapshot["request"] = request;
      if (!error.empty()) snapshot["error"] = error;
      if (core.tappable()) {
        snapshot["item"]["label"] = core.item().label;
        snapshot["item"]["color"] = core.item().color;
        if (type == "tap") {
          snapshot["call"]["service"] = "script.lunactl_run";
          snapshot["call"]["action"] = core.item().action;
          snapshot["call"]["data"] = core.item().data;
        }
      }
    }
    serializeJson(output, std::cout);
    std::cout << '\n';
  }
}
