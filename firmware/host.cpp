#include "../esphome/lunactl/core.h"
#include "../esphome/lunactl/battery.h"
#include <iostream>

static void item_view(JsonObject out, const lunactl::Core &core, size_t slot = 0) {
  const auto &item = core.item(slot);
  out["label"] = item.label;
  out["color"] = item.color;
  if (slot != lunactl::CENTER_SLOT) {
    out["icon"] = item.icon;
    out["glyph"] = lunactl::icon_glyph(item.icon);
  }
  if (item.value.present) out["value"] = core.value(slot);
  if ((!core.pie() || slot == lunactl::CENTER_SLOT) && !item.countdown.empty()) {
    auto countdown = core.countdown();
    if (countdown.remaining == 0) out["countdown"] = nullptr;
    else {
      out["countdown"]["remaining"] = countdown.remaining;
      out["countdown"]["text"] = countdown.text;
      out["countdown"]["ring"] = countdown.ring;
    }
  }
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
    bool display_seen = input["display"] | false;
    uint32_t now = 0;
    uint32_t request = 0;
    auto snapshots = output["snapshots"].to<JsonArray>();
    for (JsonObjectConst event : input["events"].as<JsonArrayConst>()) {
      std::string type = event["type"].as<std::string>();
      std::string error;
      int tapped = -1;
      lunactl::ButtonEvent button_event;
      lunactl::ConnectionAction connection_action = lunactl::ConnectionAction::NONE;
      if (!event["now"].isNull()) now = event["now"].as<uint32_t>();
      if (type == "connect") core.set_connected(true);
      else if (type == "disconnect") core.set_connected(false);
      else if (type == "fetch") request = core.begin_fetch();
      else if (type == "error") {
        auto token = event["request"].isNull() ? request : event["request"].as<uint32_t>();
        core.fetch_failed(token, event["error"] | std::string{});
      }
      else if (type == "sync") connection_action = core.take_connection_action();
      else if (type == "state") core.set_state({event["entity"].as<std::string>(), event["attribute"] | ""}, event["state"].as<std::string>());
      else if (type == "manifest") {
        auto token = event["request"].isNull() ? request : event["request"].as<uint32_t>();
        if (event["raw"].is<const char *>()) core.accept_json(token, event["raw"].as<std::string>(), error);
        else core.accept(token, event["manifest"], error);
      } else if (type == "time") {
        core.set_time(event["hour"] | -1, event["minute"] | -1, event["valid"] | true);
        if (!event["timestamp"].isNull()) core.set_timestamp(event["timestamp"].as<int64_t>(), event["valid"] | true);
      } else if (type == "page") core.show_page(event["index"].as<size_t>());
      else if (type == "press") core.press(event["x"], event["y"], now);
      else if (type == "move") core.move(event["x"], event["y"]);
      else if (type == "cancel_press") core.cancel_press();
      else if (type == "cancel_touch") core.cancel_touch();
      else if (type == "release") tapped = core.release(event["x"], event["y"], now);
      else if (type == "tap") {
        int x = event["x"] | 233, y = event["y"] | 233;
        core.press(x, y, now);
        tapped = core.release(x, y, now);
      } else if (type == "button") {
        std::string key = event["key"].as<std::string>();
        if (key != "a" && key != "b") return 2;
        button_event = core.button(key == "a" ? lunactl::Key::A : lunactl::Key::B,
                                   event["pressed"].as<bool>(), event["now"].as<uint32_t>());
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
      } else if (type == "sleep") core.sleep();
      else if (type == "tick") { core.tick(now); display_seen = true; }
      else if (type == "bubble") core.tick(now);
      else return 2;
      auto snapshot = snapshots.add<JsonObject>();
      snapshot["status"] = core.status();
      snapshot["tappable"] = core.tappable();
      if (core.offline_icon()) snapshot["offline_icon"] = true;
      if (battery_seen) {
        snapshot["battery"]["level"] = battery.level();
        snapshot["battery"]["text"] = battery.text();
        snapshot["battery"]["hint"] = battery.hint();
      }
      if (type == "fetch") snapshot["request"] = request;
      if (type == "sync") {
        snapshot["connection_action"] = connection_action == lunactl::ConnectionAction::RECONNECT ? "reconnect" :
            connection_action == lunactl::ConnectionAction::RESTART ? "restart" : "none";
        auto subscriptions = snapshot["subscriptions"].to<JsonArray>();
        for (const auto &ref : core.subscriptions()) {
          auto subscription = subscriptions.add<JsonObject>();
          subscription["entity"] = ref.entity;
          if (!ref.attribute.empty()) subscription["attribute"] = ref.attribute;
        }
      }
      if (!error.empty()) snapshot["error"] = error;
      if (type == "button" || type == "sleep") snapshot["display_on"] = core.display_on();
      if (display_seen) {
        snapshot["display_on"] = core.display_on();
        snapshot["timeout_ms"] = core.timeout_ms();
        snapshot["brightness"] = core.brightness();
        snapshot["display_brightness"] = core.display_brightness();
      }
      if (type == "button") snapshot["wake"] = button_event.wake;
      if (type == "bubble") {
        auto bubble = core.bubble(now);
        snapshot["bubble"]["visible"] = bubble.visible;
        if (bubble.visible) {
          snapshot["bubble"]["diameter"] = bubble.diameter;
          snapshot["bubble"]["opacity"] = bubble.opacity;
          snapshot["bubble"]["rgb"] = bubble.rgb;
        }
      }
      const lunactl::Action *action = nullptr;
      if (!button_event.action.action.empty()) action = &button_event.action;
      if (core.shown()) {
        snapshot["page"] = core.page_index();
        snapshot["home"] = core.page_index() == 0;
        auto dots = snapshot["dots"].to<JsonArray>();
        if (core.page_count() > 1)
          for (size_t i = 0; i < core.page_count(); ++i) dots.add(i == core.page_index());
        snapshot["type"] = core.pie() ? "pie" : core.dial() ? "dial" : "single";
        if (core.dial()) {
          snapshot["clock"] = core.clock();
          auto dial = snapshot["dial"].to<JsonObject>();
          dial["status"] = core.dial_status();
          dial["value"] = core.dial_value();
          dial["caption"] = core.dial_caption();
          char color[8];
          std::snprintf(color, sizeof(color), "#%06X", static_cast<unsigned>(core.dial_rgb()));
          dial["color"] = color;
          for (size_t slot = 0; slot < 2; ++slot) {
            auto button = dial[slot == 0 ? "minus" : "plus"].to<JsonObject>();
            button["visible"] = core.slot_tappable(slot);
            button["color"] = core.item(slot).color;
          }
          auto items = dial["items"].to<JsonArray>();
          for (size_t slot = 2; slot < 5; ++slot) {
            auto item = items.add<JsonObject>();
            item["tappable"] = core.slot_tappable(slot);
            if (!core.slot_tappable(slot)) continue;
            item["icon"] = core.item(slot).icon;
            item["glyph"] = lunactl::icon_glyph(core.item(slot).icon);
            item["color"] = core.item(slot).color;
            item["active"] = core.active(slot);
          }
          auto countdown = core.countdown();
          if (countdown.remaining == 0) dial["countdown"] = nullptr;
          else {
            dial["countdown"]["remaining"] = countdown.remaining;
            dial["countdown"]["ring"] = countdown.ring;
          }
        } else if (core.pie()) {
          snapshot["clock"] = core.clock();
          snapshot["hole_radius"] = core.hole_radius();
          if (core.center()) {
            snapshot["clock_position"] = "top-gap";
            item_view(snapshot["center"].to<JsonObject>(), core, lunactl::CENTER_SLOT);
          }
          auto quarters = snapshot["quarters"].to<JsonArray>();
          for (size_t slot = 0; slot < 4; ++slot) {
            auto quarter = quarters.add<JsonObject>();
            quarter["tappable"] = core.slot_tappable(slot);
            if (core.slot_tappable(slot)) {
              if (core.center()) {
                quarter["label"] = core.item(slot).label;
                quarter["color"] = core.item(slot).color;
                quarter["curved"] = true;
              } else item_view(quarter, core, slot);
            } else quarter["color"] = "#202020";
          }
        } else item_view(snapshot["item"].to<JsonObject>(), core);
        if (tapped >= 0) action = &core.item(tapped);
      }
      if (action != nullptr) {
        snapshot["call"]["service"] = "lunactl.run";
        snapshot["call"]["action"] = action->action;
        snapshot["call"]["data"] = action->data;
      }
    }
    serializeJson(output, std::cout);
    std::cout << '\n';
  }
}
