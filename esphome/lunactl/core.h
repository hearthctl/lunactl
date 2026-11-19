#pragma once

// Platform independent: the host and ESPHome use the same parser and state machine.
#include <ArduinoJson.h>
#include <cstdint>
#include <initializer_list>
#include <string>
#include <utility>
#include <array>
#include <vector>
#include <cstdio>
#include <cstdlib>
#include <algorithm>
#include <cmath>
#include <cerrno>
#include "icons.h"
#include "countdown.h"

namespace lunactl {

inline constexpr int MAX_SCHEMA_VERSION = 1;

constexpr size_t MAX_MANIFEST_BYTES = 32 * 1024;
constexpr size_t CENTER_SLOT = 4;
constexpr int CENTER_HOLE_RADIUS = 168;
constexpr int CENTER_QUARTER_ANGLE = 74;
// Clockwise from top-left, in LVGL's coordinates (0° right, 90° bottom).
constexpr std::array<int, 4> QUARTER_ANGLES{{225, 315, 45, 135}};
// Dial: minus, plus, then the three bottom Slots from left to right.
constexpr int DIAL_BUTTON_RADIUS = 44;
constexpr int DIAL_HIT_RADIUS = 50;
constexpr std::array<std::array<int, 2>, 5> DIAL_CENTERS{{{{84, 196}}, {{382, 196}}, {{131, 358}}, {{233, 358}}, {{335, 358}}}};
constexpr uint32_t DIAL_IDLE_RGB = 0x8A93A3;

struct Action {
  std::string action;
  // lunactl.run's JSON-text field contains the complete target/data pair.
  std::string data;
};

struct Reference {
  std::string entity, attribute;
  bool operator==(const Reference &other) const {
    return entity == other.entity && attribute == other.attribute;
  }
};
struct ValueReference : Reference {
  int decimals{-1};
  bool decimal_comma{false};
  std::vector<std::pair<std::string, std::string>> map;
};
struct Value {
  bool present{false};
  std::string format;
  std::vector<ValueReference> refs;
};
enum class ConnectionAction { NONE, RECONNECT, RESTART };

// Aktiv: the Item counts as active while the referenced state is one of states.
struct Active : Reference {
  bool present{false};
  std::vector<std::string> states;
};

struct Item : Action {
  std::string icon;
  std::string label;
  std::string color;
  uint32_t rgb{0};
  Value value;
  std::string countdown;
  Active active;
};

enum class Key : uint8_t { A, B };
constexpr uint32_t LONG_PRESS_MS = 1000;
// Disconnected: an attempted action flashes the offline icon; after the
// stale period it stays until the connection returns.
constexpr uint32_t OFFLINE_HINT_MS = 3000;
constexpr uint32_t OFFLINE_STALE_MS = 10 * 60 * 1000;
constexpr std::array<const char *, 4> BUTTON_NAMES{{"a_short", "a_long", "b_short", "b_long"}};

struct ButtonEvent {
  bool wake{false};
  Action action;
};

inline bool keys(JsonVariantConst value, std::initializer_list<const char *> allowed) {
  if (!value.is<JsonObjectConst>()) return false;
  for (JsonPairConst pair : value.as<JsonObjectConst>()) {
    bool found = false;
    for (const char *key : allowed) found |= pair.key() == key;
    if (!found) return false;
  }
  return true;
}

inline bool nonempty_string(JsonVariantConst value) {
  return value.is<const char *>() && value.as<JsonString>().size() > 0;
}

inline bool action_name(JsonVariantConst value) {
  if (!nonempty_string(value)) return false;
  bool dot = false;
  std::string name = value.as<std::string>();
  for (size_t i = 0; i < name.size(); ++i) {
    char c = name[i];
    if (c == '.' && !dot && i > 0 && i + 1 < name.size()) dot = true;
    else if (!(c >= 'a' && c <= 'z') && !(c >= '0' && c <= '9') && c != '_') return false;
  }
  return dot;
}

inline bool parse_value(JsonVariantConst source, Value &value) {
  if (!keys(source, {"format", "refs"}) || !nonempty_string(source["format"]) ||
      !source["refs"].is<JsonArrayConst>() || source["refs"].size() == 0) return false;
  value.present = true;
  value.format = source["format"].as<std::string>();
  for (JsonVariantConst ref : source["refs"].as<JsonArrayConst>()) {
    if (!keys(ref, {"entity", "attribute", "decimals", "decimal_comma", "map"}) ||
        !action_name(ref["entity"])) return false;
    ValueReference result;
    result.entity = ref["entity"].as<std::string>();
    if (!ref["attribute"].isUnbound()) {
      if (!nonempty_string(ref["attribute"])) return false;
      result.attribute = ref["attribute"].as<std::string>();
    }
    if (!ref["decimals"].isUnbound()) {
      if (!ref["decimals"].is<double>()) return false;
      double digits = ref["decimals"].as<double>();
      if (digits < 0 || digits > 6 || std::floor(digits) != digits) return false;
      result.decimals = static_cast<int>(digits);
    }
    if (!ref["decimal_comma"].isUnbound()) {
      if (!ref["decimal_comma"].is<bool>()) return false;
      result.decimal_comma = ref["decimal_comma"].as<bool>();
    }
    if (!ref["map"].isUnbound()) {
      if (!ref["map"].is<JsonObjectConst>()) return false;
      for (JsonPairConst entry : ref["map"].as<JsonObjectConst>()) {
        if (!entry.value().is<const char *>()) return false;
        result.map.emplace_back(entry.key().c_str(), entry.value().as<std::string>());
      }
    }
    value.refs.push_back(std::move(result));
  }
  return true;
}

inline std::string format_reference(const ValueReference &ref, const std::string &state) {
  if (state.empty()) return "--";
  for (const auto &entry : ref.map) if (entry.first == state) return entry.second;
  if (state == "unknown" || state == "unavailable") return "--";
  if (ref.decimals < 0 && !ref.decimal_comma) return state;
  char *end = nullptr;
  errno = 0;
  double number = std::strtod(state.c_str(), &end);
  if (end == state.c_str() || end != state.c_str() + state.size() || errno == ERANGE || !std::isfinite(number)) return "--";
  std::string result = state;
  if (ref.decimals >= 0) {
    // A finite double in fixed notation fits in 317 bytes, including 6 decimals.
    char text[320];
    std::snprintf(text, sizeof(text), "%.*f", ref.decimals, number);
    result = text;
    if (result[0] == '-' && result.find_first_not_of("0.", 1) == std::string::npos)
      result.erase(0, 1);  // Avoid a rounded negative zero, including halfway ties.
  }
  if (ref.decimal_comma) std::replace(result.begin(), result.end(), '.', ',');
  return result;
}

inline bool target_valid(JsonVariantConst value) {
  if (!keys(value, {"entity_id", "device_id", "area_id", "floor_id", "label_id"})) return false;
  for (JsonPairConst pair : value.as<JsonObjectConst>()) {
    if (nonempty_string(pair.value())) continue;
    if (!pair.value().is<JsonArrayConst>() || pair.value().size() == 0) return false;
    for (JsonVariantConst entry : pair.value().as<JsonArrayConst>())
      if (!nonempty_string(entry)) return false;
  }
  return true;
}

struct Page {
  bool pie{false};
  bool dial{false};
  // Pie, clockwise: top-left, top-right, bottom-right, bottom-left; optional center is slot 4.
  // Dial: minus, plus, then the three bottom Slots (see DIAL_CENTERS).
  std::array<Item, 5> items;
  Value status, value, caption;  // Dial live values.
  std::string countdown;         // Dial timer.
};
struct Display {
  uint32_t timeout_ms{10000};
  std::string brightness_entity;
};
struct Manifest {
  Display display;
  std::vector<Page> pages;
  std::array<Action, 4> buttons;
};

inline bool parse_action(JsonVariantConst action, Action &result, std::string &error) {
  if (!keys(action, {"action", "target", "data"}) || !action_name(action["action"])) {
    error = "Invalid action";
    return false;
  }
  if (!action["target"].isUnbound() && !target_valid(action["target"])) {
    error = "Invalid action target";
    return false;
  }
  if (!action["data"].isUnbound() && !action["data"].is<JsonObjectConst>()) {
    error = "Invalid action data";
    return false;
  }
  JsonDocument payload;
  if (action["target"].isUnbound()) payload["target"].to<JsonObject>();
  else payload["target"] = action["target"];
  if (action["data"].isUnbound()) payload["data"].to<JsonObject>();
  else payload["data"] = action["data"];
  result.action = action["action"].as<std::string>();
  serializeJson(payload, result.data);
  return true;
}

inline bool timer_name(JsonVariantConst value) {
  return action_name(value) && value.as<std::string>().compare(0, 6, "timer.") == 0;
}

inline bool parse_active(JsonVariantConst source, Active &active) {
  if (!keys(source, {"entity", "attribute", "states"}) || !action_name(source["entity"]) ||
      !source["states"].is<JsonArrayConst>() || source["states"].size() == 0) return false;
  if (!source["attribute"].isUnbound()) {
    if (!nonempty_string(source["attribute"])) return false;
    active.attribute = source["attribute"].as<std::string>();
  }
  for (JsonVariantConst state : source["states"].as<JsonArrayConst>()) {
    if (!state.is<const char *>()) return false;
    active.states.push_back(state.as<std::string>());
  }
  active.entity = source["entity"].as<std::string>();
  active.present = true;
  return true;
}

inline bool parse_item(JsonVariantConst source, Item &item, std::string &error) {
  auto reject = [&error](const char *message) { error = message; return false; };
  if (!keys(source, {"label", "color", "icon", "action", "value", "countdown", "active"}) || !nonempty_string(source["label"]))
    return reject("Invalid Item");
  if (!source["icon"].isUnbound() && !nonempty_string(source["icon"])) return reject("Invalid Item icon");
  if (!source["color"].is<const char *>()) return reject("Invalid Item color");
  std::string color = source["color"].as<std::string>();
  if (color.size() != 7 || color[0] != '#') return reject("Expected #RRGGBB color");
  uint32_t rgb = 0;
  for (size_t i = 1; i < color.size(); ++i) {
    char c = color[i];
    int digit = c >= '0' && c <= '9' ? c - '0' : c >= 'A' && c <= 'F' ? c - 'A' + 10 :
                c >= 'a' && c <= 'f' ? c - 'a' + 10 : -1;
    if (digit < 0) return reject("Expected #RRGGBB color");
    rgb = (rgb << 4) | digit;
  }
  Item candidate;
  if (!parse_action(source["action"], candidate, error)) return false;
  if (!source["value"].isUnbound() && !parse_value(source["value"], candidate.value))
    return reject("Invalid Item value");
  if (!source["countdown"].isUnbound()) {
    if (!timer_name(source["countdown"])) return reject("Invalid Item countdown");
    candidate.countdown = source["countdown"].as<std::string>();
  }
  if (!source["active"].isUnbound() && !parse_active(source["active"], candidate.active))
    return reject("Invalid Item active");
  if (!source["icon"].isUnbound()) {
    std::string name = source["icon"].as<std::string>();
    if (!resolve_icon(name)) return reject("Invalid Item icon");
    candidate.icon = std::move(name);
  }
  candidate.label = source["label"].as<std::string>();
  candidate.color = color;
  candidate.rgb = rgb;
  item = std::move(candidate);
  error.clear();
  return true;
}

inline bool parse_manifest(JsonVariantConst root, Manifest &manifest, std::string &error) {
  auto reject = [&error](const char *message) { error = message; return false; };
  if (measureJson(root) > MAX_MANIFEST_BYTES) return reject("Manifest exceeds 32 KiB");
  if (!keys(root, {"schema", "pages", "buttons", "display"})) return reject("Invalid Manifest fields");
  if (!root["schema"].is<double>() || (root["schema"].as<double>() < 1 ||
      root["schema"].as<double>() > MAX_SCHEMA_VERSION ||
      root["schema"].as<double>() != static_cast<int>(root["schema"].as<double>())))
    return reject("Unknown or invalid schema version");
  auto display = root["display"];
  if (!display.isUnbound()) {
    if (!keys(display, {"timeout", "brightness"})) return reject("Invalid display");
    auto timeout = display["timeout"];
    if (!timeout.isUnbound()) {
      if (!timeout.is<double>()) return reject("Invalid display timeout");
      double seconds = timeout.as<double>();
      if (!std::isfinite(seconds) || seconds < 0.001 || seconds > 4294967.295)
        return reject("Invalid display timeout");
      manifest.display.timeout_ms = static_cast<uint32_t>(std::round(seconds * 1000));
    }
    if (!display["brightness"].isUnbound()) {
      if (!action_name(display["brightness"])) return reject("Invalid display brightness entity");
      manifest.display.brightness_entity = display["brightness"].as<std::string>();
    }
  }
  auto pages = root["pages"];
  if (!pages.is<JsonArrayConst>() || pages.size() < 1 || pages.size() > 6)
    return reject("Expected one to six pages");
  for (JsonVariantConst source : pages.as<JsonArrayConst>()) {
    Page page;
    if (source["type"] == "single") {
      if (!keys(source, {"type", "item"})) return reject("Invalid single page");
      if (!parse_item(source["item"], page.items[0], error)) return false;
    } else if (source["type"] == "pie") {
      if (!keys(source, {"type", "quarters", "center"})) return reject("Invalid pie page");
      auto quarters = source["quarters"];
      if (!quarters.is<JsonArrayConst>() || quarters.size() != 4) return reject("Expected four quarters");
      page.pie = true;
      if (!source["center"].isUnbound() &&
          !parse_item(source["center"], page.items[CENTER_SLOT], error)) return false;
      for (size_t slot = 0; slot < 4; ++slot) {
        if (quarters[slot].isNull()) continue;
        if (!parse_item(quarters[slot], page.items[slot], error)) return false;
      }
    } else if (source["type"] == "dial") {
      if (!keys(source, {"type", "status", "value", "caption", "minus", "plus", "items", "countdown"}))
        return reject("Invalid dial page");
      page.dial = true;
      if (!parse_value(source["value"], page.value) ||
          (!source["status"].isUnbound() && !parse_value(source["status"], page.status)) ||
          (!source["caption"].isUnbound() && !parse_value(source["caption"], page.caption)))
        return reject("Invalid dial value");
      if (!source["countdown"].isUnbound()) {
        if (!timer_name(source["countdown"])) return reject("Invalid dial countdown");
        page.countdown = source["countdown"].as<std::string>();
      }
      if (!parse_item(source["minus"], page.items[0], error) ||
          !parse_item(source["plus"], page.items[1], error)) return false;
      auto items = source["items"];
      if (!items.is<JsonArrayConst>() || items.size() != 3) return reject("Expected three dial items");
      for (size_t slot = 0; slot < 3; ++slot) {
        if (items[slot].isNull()) continue;
        if (!parse_item(items[slot], page.items[slot + 2], error)) return false;
        if (page.items[slot + 2].icon.empty()) return reject("Dial items need an icon");
      }
    } else return reject("Unknown page type");
    manifest.pages.push_back(std::move(page));
  }
  auto buttons = root["buttons"];
  if (!buttons.isUnbound()) {
    if (!keys(buttons, {"a_short", "a_long", "b_short", "b_long"}))
      return reject("Invalid buttons");
    for (size_t i = 0; i < BUTTON_NAMES.size(); ++i) {
      auto binding = buttons[BUTTON_NAMES[i]];
      if (!binding.isUnbound() && !parse_action(binding, manifest.buttons[i], error)) return false;
    }
  }
  error.clear();
  return true;
}

class Core {
 public:
  void set_connected(bool connected) {
    if (connected_ == connected) return;
    connected_ = connected;
    ++revision_;
    // An interrupted key press must not dispatch after a reconnect.
    if (!connected) {
      for (auto &button : buttons_) button.actions = {};
      disconnected_at_ = now_;  // tick() advances now_ every 10 ms.
    }
    attempted_ = false;
    ++request_;  // Invalidates replies from an earlier connection.
    // Keep the last valid Manifest and states in RAM; an invalid replacement
    // must not destroy them. Disconnected they stay visible but inert; HA
    // resends every subscribed state on reconnect.
  }
  bool connected() const { return connected_; }
  uint32_t revision() const { return revision_; }
  uint32_t begin_fetch() { return connected_ ? ++request_ : 0; }
  bool current(uint32_t request) const { return connected_ && request != 0 && request == request_; }
  bool accept(uint32_t request, JsonVariantConst root, std::string &error) {
    if (!current(request)) { error = "Stale Manifest response"; return false; }
    Manifest candidate;
    if (!parse_manifest(root, candidate, error)) return false;
    std::vector<Reference> required;
    auto require = [&](const Reference &ref) {
      if (std::find(required.begin(), required.end(), ref) == required.end()) required.push_back(ref);
    };
    auto require_timer = [&](const std::string &timer) {
      if (timer.empty()) return;
      require({timer, ""});
      require({timer, "finishes_at"});
      require({timer, "duration"});
    };
    for (const auto &page : candidate.pages) {
      for (const auto &item : page.items) {
        for (const auto &ref : item.value.refs) require(ref);
        require_timer(item.countdown);
        if (item.active.present) require(item.active);
      }
      for (const auto *value : {&page.status, &page.value, &page.caption})
        for (const auto &ref : value->refs) require(ref);
      require_timer(page.countdown);
    }
    if (!candidate.display.brightness_entity.empty()) require({candidate.display.brightness_entity, ""});
    if (!subscriptions_initialized_) {
      subscriptions_ = std::move(required);
      states_.resize(subscriptions_.size());
      subscriptions_initialized_ = true;
      if (!subscriptions_.empty()) connection_action_ = ConnectionAction::RECONNECT;
    } else {
      for (const auto &ref : required) {
        if (std::find(subscriptions_.begin(), subscriptions_.end(), ref) == subscriptions_.end()) {
          connection_action_ = ConnectionAction::RESTART;
          error = "Manifest needs new subscriptions; restarting";
          return false;
        }
      }
    }
    manifest_ = std::move(candidate);
    page_ = 0;
    ++revision_;
    has_manifest_ = true;
    return true;
  }
  bool accept_json(uint32_t request, const std::string &json, std::string &error) {
    if (json.size() > MAX_MANIFEST_BYTES) { error = "Manifest exceeds 32 KiB"; return false; }
    JsonDocument doc;
    auto result = deserializeJson(doc, json, DeserializationOption::NestingLimit(32));
    if (result) { error = "Invalid JSON"; return false; }
    return accept(request, doc.as<JsonVariantConst>(), error);
  }
  // Shown: the Manifest is on screen, also while Disconnected.
  // Tappable: it can run actions, which needs the connection.
  bool shown() const { return has_manifest_; }
  bool tappable() const { return connected_ && has_manifest_; }
  bool offline_icon() const {
    return shown() && !connected_ &&
           (now_ - disconnected_at_ >= OFFLINE_STALE_MS || (attempted_ && now_ - attempted_at_ < OFFLINE_HINT_MS));
  }
  const Item &item(size_t slot = 0) const { return manifest_.pages[page_].items[slot]; }
  size_t slots() const { return pie() || dial() ? 5u : 1u; }
  bool slot_tappable(size_t slot) const {
    return shown() && slot < slots() && !item(slot).action.empty() && (!dial() || slot >= 2 || active(slot));
  }
  bool pie() const { return has_manifest_ && manifest_.pages[page_].pie; }
  bool dial() const { return has_manifest_ && manifest_.pages[page_].dial; }
  // Without an active reference, an Item counts as active only for Dial's minus and plus.
  bool active(size_t slot) const {
    if (!shown() || slot >= slots()) return false;
    const auto &active = item(slot).active;
    if (!active.present) return dial() && slot < 2;
    auto state = this->state(active);
    return std::find(active.states.begin(), active.states.end(), state) != active.states.end();
  }
  // Dial ring and status: the first active bottom Item's colour, else grey.
  uint32_t dial_rgb() const {
    for (size_t slot = 2; slot < 5; ++slot)
      if (slot_tappable(slot) && active(slot)) return item(slot).rgb;
    return DIAL_IDLE_RGB;
  }
  std::string dial_status() const {
    if (!dial()) return "";
    std::string text = format(manifest_.pages[page_].status);
    auto timer = countdown();
    if (timer.remaining > 0) {
      text += (text.empty() ? "noch " : " · noch ") + std::to_string((timer.remaining + 59) / 60) + " min";
    }
    return text;
  }
  std::string dial_value() const { return dial() ? format(manifest_.pages[page_].value) : ""; }
  std::string dial_caption() const { return dial() ? format(manifest_.pages[page_].caption) : ""; }
  bool center() const { return pie() && !item(CENTER_SLOT).action.empty(); }
  size_t main_slot() const { return center() ? CENTER_SLOT : 0; }
  int hole_radius() const { return center() ? CENTER_HOLE_RADIUS : 56; }
  size_t page_count() const { return manifest_.pages.size(); }
  size_t page_index() const { return page_; }
  bool show_page(size_t index) {
    if (!shown() || index >= manifest_.pages.size()) return false;
    page_ = index;
    ++revision_;
    return true;
  }
  const std::vector<Reference> &subscriptions() const { return subscriptions_; }
  ConnectionAction take_connection_action() {
    auto action = connection_action_;
    connection_action_ = ConnectionAction::NONE;
    return action;
  }
  void set_state(const Reference &ref, const std::string &state) {
    if (!connected_) return;
    auto found = std::find(subscriptions_.begin(), subscriptions_.end(), ref);
    if (found != subscriptions_.end()) states_[found - subscriptions_.begin()] = state;
  }
  std::string value(size_t slot = 0) const {
    if (!shown() || slot >= slots()) return "";
    return format(item(slot).value);
  }
  std::string format(const Value &value) const {
    std::vector<std::string> replacements;
    for (const auto &ref : value.refs) replacements.push_back(format_reference(ref, state(ref)));
    // Match complete tokens in the original format. State text is never parsed
    // as another placeholder, and {1} cannot accidentally replace part of {10}.
    std::string result;
    for (size_t i = 0; i < value.format.size();) {
      bool replaced = false;
      if (value.format[i] == '{') {
        for (size_t n = 0; n < replacements.size(); ++n) {
          std::string token = "{" + std::to_string(n) + "}";
          if (value.format.compare(i, token.size(), token) == 0) {
            result += replacements[n];
            i += token.size();
            replaced = true;
            break;
          }
        }
      }
      if (!replaced) result += value.format[i++];
    }
    return result;
  }
  void set_time(int hour, int minute, bool valid = true) {
    if (!valid || hour < 0 || hour > 23 || minute < 0 || minute > 59) clock_ = "--:--";
    else {
      char text[6];
      std::snprintf(text, sizeof(text), "%02d:%02d", hour, minute);
      clock_ = text;
    }
  }
  const std::string &clock() const { return clock_; }
  void set_timestamp(int64_t now, bool valid = true) { timestamp_ = now; time_valid_ = valid; }
  Countdown countdown() const {
    if (!shown() || (pie() && !center())) return {};
    const auto &timer = dial() ? manifest_.pages[page_].countdown : item(main_slot()).countdown;
    if (timer.empty()) return {};
    return countdown_view(state({timer, ""}), state({timer, "finishes_at"}), state({timer, "duration"}),
                          timestamp_, time_valid_);
  }
  // Shared display geometry for the host and LVGL UI.
  int hit(int x, int y) const {
    if (!shown() || x < 0 || x >= 466 || y < 0 || y >= 466) return -1;
    int dx = x - 233, dy = y - 233;
    if (dx * dx + dy * dy > 233 * 233) return -1;
    if (page_count() > 1 && y >= 437 && y < 465 &&
        x >= dots_left() && x < dots_left() + dots_width()) return -1;
    if (dial()) {
      for (size_t slot = 0; slot < DIAL_CENTERS.size(); ++slot) {
        int bx = x - DIAL_CENTERS[slot][0], by = y - DIAL_CENTERS[slot][1];
        if (bx * bx + by * by <= DIAL_HIT_RADIUS * DIAL_HIT_RADIUS) return slot_tappable(slot) ? slot : -1;
      }
      return -1;
    }
    if (!pie()) return dx * dx + dy * dy <= 140 * 140 ? 0 : -1;
    if (center()) {
      if (dx * dx + dy * dy <= 140 * 140) return CENTER_SLOT;
      if (dx * dx + dy * dy <= CENTER_HOLE_RADIUS * CENTER_HOLE_RADIUS) return -1;
      double angle = std::atan2(dy, dx) * 180 / 3.14159265358979323846;
      if (angle < 0) angle += 360;
      // The gaps between coloured arcs include the clock at the top.
      double within_quarter = std::fmod(angle, 90.0);
      if (within_quarter < (90 - CENTER_QUARTER_ANGLE) / 2.0 ||
          within_quarter > (90 + CENTER_QUARTER_ANGLE) / 2.0) return -1;
    } else if (dx * dx + dy * dy <= 56 * 56 || (dx >= -3 && dx < 3) || (dy >= -3 && dy < 3)) return -1;
    int slot = dy < 0 ? (dx < 0 ? 0 : 1) : (dx < 0 ? 3 : 2);
    return slot_tappable(slot) ? slot : -1;
  }
  int dots_width() const { return static_cast<int>(page_count()) * 18 + 12; }
  int dots_left() const { return (466 - dots_width()) / 2; }
  bool press(int x, int y) { return press(x, y, now_); }
  // False for a wake touch: it neither navigates nor runs an Item.
  bool press(int x, int y, uint32_t now) {
    bool was_on = display_on_;
    wake(now);
    touch_down_ = true;
    press_x_ = x; press_y_ = y; press_revision_ = revision_; pressed_ = was_on && shown();
    return pressed_;
  }
  // Once a contact moved, returning to its origin must not turn it into a tap.
  bool move(int x, int y) {
    if (std::abs(x - press_x_) > 20 || std::abs(y - press_y_) > 20) cancel_press();
    return pressed_;
  }
  void cancel_press() { pressed_ = false; }
  void cancel_touch() { pressed_ = touch_down_ = false; }
  // Returns an Item slot only for a tap. Navigation never runs an action.
  int release(int x, int y) { return release(x, y, now_); }
  int release(int x, int y, uint32_t now) {
    if (touch_down_) wake(now);
    touch_down_ = false;
    if (!pressed_) return -1;
    pressed_ = false;
    if (!shown() || press_revision_ != revision_) return -1;
    int dx = x - press_x_, dy = y - press_y_;
    if (std::abs(dx) >= 60 && std::abs(dx) > std::abs(dy)) {
      if (dx < 0 && page_ + 1 < page_count()) show_page(page_ + 1);
      else if (dx > 0 && page_ > 0) show_page(page_ - 1);
      return -1;
    }
    if (std::abs(dx) > 20 || std::abs(dy) > 20) return -1;
    int slot = hit(x, y);
    if (slot < 0 || hit(press_x_, press_y_) != slot) return -1;
    if (!connected_) {
      attempt(now);
      return -1;
    }
    return slot;
  }
  uint32_t timeout_ms() const { return manifest_.display.timeout_ms; }
  bool display_on() const { return display_on_; }
  // Brightness entities supply percentages. Invalid or missing states use 70%.
  double brightness() const {
    Reference ref{manifest_.display.brightness_entity, ""};
    auto found = std::find(subscriptions_.begin(), subscriptions_.end(), ref);
    if (ref.entity.empty() || found == subscriptions_.end()) return 70;
    const auto &state = states_[found - subscriptions_.begin()];
    char *end = nullptr;
    errno = 0;
    double percent = std::strtod(state.c_str(), &end);
    if (end == state.c_str() || end != state.c_str() + state.size() || errno == ERANGE ||
        !std::isfinite(percent) || percent < 0 || percent > 100) return 70;
    return percent;
  }
  uint8_t display_brightness() const {
    return display_on_ ? static_cast<uint8_t>(std::round(brightness() * 255 / 100)) : 0;
  }
  void wake(uint32_t now) {
    now_ = last_activity_ = now;
    display_on_ = true;
  }
  void sleep() {
    display_on_ = false;
    pressed_ = false;
    ++revision_;
  }
  // Unsigned subtraction keeps idle timing correct across millis() wraparound.
  // Held touches/keys keep the display awake through their release.
  // Also reports a change of the offline icon, which needs a render.
  bool tick(uint32_t now) {
    now_ = now;
    bool icon_changed = offline_icon() != icon_;
    icon_ = offline_icon();
    if (touch_down_ || buttons_[0].pressed || buttons_[1].pressed) last_activity_ = now;
    if (!display_on_ || now - last_activity_ < timeout_ms()) return icon_changed;
    sleep();
    return true;
  }
  const char *status() const { return has_manifest_ ? "" : connected_ ? "Kein Manifest" : "Keine Verbindung"; }

  // Call with debounced key levels on edges and/or while polling. Unsigned
  // subtraction preserves the threshold across the millis() wraparound.
  ButtonEvent button(Key key, bool pressed, uint32_t now) {
    auto index = static_cast<size_t>(key);
    if (index >= buttons_.size()) return {};
    auto &state = buttons_[index];
    ButtonEvent event;
    if (!state.pressed && pressed) {
      state.pressed = true;
      state.long_fired = false;
      state.since = now;
      // Keep each press tied to the Manifest present at its start.
      state.actions = {};
      if (tappable()) {
        state.actions[0] = manifest_.buttons[index * 2];
        state.actions[1] = manifest_.buttons[index * 2 + 1];
      } else if (shown() && (!manifest_.buttons[index * 2].action.empty() ||
                             !manifest_.buttons[index * 2 + 1].action.empty())) {
        attempt(now);
      }
      wake(now);
      event.wake = true;
    } else if (state.pressed) {
      wake(now);
      if (!state.long_fired && now - state.since >= LONG_PRESS_MS) {
        state.long_fired = true;
        if (tappable()) event.action = state.actions[1];
      } else if (!pressed && !state.long_fired && tappable()) {
        event.action = state.actions[0];
      }
      if (!pressed) {
        state.pressed = false;
        state.actions = {};
      }
    }
    return event;
  }

 private:
  std::string state(const Reference &ref) const {
    auto found = std::find(subscriptions_.begin(), subscriptions_.end(), ref);
    return found == subscriptions_.end() ? "" : states_[found - subscriptions_.begin()];
  }
  void attempt(uint32_t now) {
    attempted_ = true;
    attempted_at_ = now;
  }
  bool connected_{false};
  bool has_manifest_{false};
  bool subscriptions_initialized_{false};
  // Fixed after the first valid Manifest: ESPHome retains pointers into these
  // strings, and HA cannot unsubscribe until the next boot.
  std::vector<Reference> subscriptions_;
  std::vector<std::string> states_;
  ConnectionAction connection_action_{ConnectionAction::NONE};
  uint32_t request_{0};
  Manifest manifest_;
  size_t page_{0};
  std::string clock_{"--:--"};
  int64_t timestamp_{0};
  bool time_valid_{false};
  uint32_t revision_{0}, press_revision_{0};
  int press_x_{0}, press_y_{0};
  bool pressed_{false};
  bool touch_down_{false};
  bool display_on_{true};
  uint32_t now_{0}, last_activity_{0};
  uint32_t disconnected_at_{0}, attempted_at_{0};
  bool attempted_{false};
  bool icon_{false};
  struct ButtonState {
    bool pressed{false};
    bool long_fired{false};
    uint32_t since{0};
    std::array<Action, 2> actions;
  };
  std::array<ButtonState, 2> buttons_;
};

}  // namespace lunactl
