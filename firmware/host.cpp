#include "../esphome/lunactl/core.h"
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
    uint32_t request = 0;
    auto snapshots = output["snapshots"].to<JsonArray>();
    for (JsonObjectConst event : input["events"].as<JsonArrayConst>()) {
      std::string type = event["type"].as<std::string>();
      std::string error;
      int tapped = -1;
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
      } else if (type != "error") return 2;
      auto snapshot = snapshots.add<JsonObject>();
      snapshot["status"] = core.status();
      snapshot["tappable"] = core.tappable();
      if (type == "fetch") snapshot["request"] = request;
      if (!error.empty()) snapshot["error"] = error;
      if (type == "manifest" && !core.warnings().empty()) {
        auto warnings = snapshot["warnings"].to<JsonArray>();
        for (const auto &warning : core.warnings()) warnings.add(warning);
      }
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
        if (tapped >= 0) {
          snapshot["call"]["service"] = "script.lunactl_run";
          snapshot["call"]["action"] = core.item(tapped).action;
          snapshot["call"]["data"] = core.item(tapped).data;
        }
      }
    }
    serializeJson(output, std::cout);
    std::cout << '\n';
  }
}
