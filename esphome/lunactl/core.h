#pragma once

// Platform independent: the host and ESPHome use the same parser and state machine.
#include <ArduinoJson.h>
#include <array>
#include <cstdint>
#include <initializer_list>
#include <string>
#include <utility>

namespace lunactl {

constexpr size_t MAX_MANIFEST_BYTES = 32 * 1024;

struct Action {
  std::string action;
  // lunactl_run's JSON-text field contains the complete target/data pair.
  std::string data;
};

struct Item : Action {
  std::string label;
  std::string color;
  uint32_t rgb{0};
};

enum class Key : uint8_t { A, B };
constexpr uint32_t LONG_PRESS_MS = 1000;
constexpr std::array<const char *, 4> BUTTON_NAMES{{"a_short", "a_long", "b_short", "b_long"}};

struct Manifest {
  Item item;
  std::array<Action, 4> buttons;
};

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

inline bool parse_manifest(JsonVariantConst root, Manifest &manifest, std::string &error) {
  auto reject = [&error](const char *message) { error = message; return false; };
  if (measureJson(root) > MAX_MANIFEST_BYTES) return reject("Manifest exceeds 32 KiB");
  if (!keys(root, {"schema", "pages", "buttons"})) return reject("Invalid Manifest fields");
  if (!root["schema"].is<double>() || root["schema"].as<double>() != 1)
    return reject("Unknown or invalid schema version");
  auto pages = root["pages"];
  if (!pages.is<JsonArrayConst>() || pages.size() != 1) return reject("Expected one page");
  auto page = pages[0];
  if (!keys(page, {"type", "item"}) || page["type"] != "single") return reject("Expected single page");
  auto source = page["item"];
  if (!keys(source, {"label", "color", "action"}) || !nonempty_string(source["label"]))
    return reject("Invalid Item");
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
  Manifest candidate;
  if (!parse_action(source["action"], candidate.item, error)) return false;
  candidate.item.label = source["label"].as<std::string>();
  candidate.item.color = color;
  candidate.item.rgb = rgb;
  auto buttons = root["buttons"];
  if (!buttons.isUnbound()) {
    if (!keys(buttons, {"a_short", "a_long", "b_short", "b_long"}))
      return reject("Invalid buttons");
    for (size_t i = 0; i < BUTTON_NAMES.size(); ++i) {
      auto binding = buttons[BUTTON_NAMES[i]];
      if (!binding.isUnbound() && !parse_action(binding, candidate.buttons[i], error)) return false;
    }
  }
  manifest = std::move(candidate);
  error.clear();
  return true;
}

class Core {
 public:
  void set_connected(bool connected) {
    if (connected_ == connected) return;
    connected_ = connected;
    // An interrupted press must not dispatch after a reconnect.
    if (!connected) {
      for (auto &button : buttons_) button.actions = {};
    }
    ++request_;  // Invalidates replies from an earlier connection.
    // Keep the last valid Manifest in RAM; an invalid replacement must not
    // destroy it, including after reconnect. Offline it is hidden and inert.
  }
  bool connected() const { return connected_; }
  uint32_t begin_fetch() { return connected_ ? ++request_ : 0; }
  bool current(uint32_t request) const { return connected_ && request != 0 && request == request_; }
  bool accept(uint32_t request, JsonVariantConst root, std::string &error) {
    if (!current(request)) { error = "Stale Manifest response"; return false; }
    Manifest candidate;
    if (!parse_manifest(root, candidate, error)) return false;
    manifest_ = std::move(candidate);
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
  bool tappable() const { return connected_ && has_manifest_; }
  const Item &item() const { return manifest_.item; }
  const char *status() const { return !connected_ ? "Keine Verbindung" : has_manifest_ ? "" : "Kein Manifest"; }

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
      }
      event.wake = true;
    } else if (state.pressed) {
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
  bool connected_{false};
  bool has_manifest_{false};
  uint32_t request_{0};
  Manifest manifest_;
  struct ButtonState {
    bool pressed{false};
    bool long_fired{false};
    uint32_t since{0};
    std::array<Action, 2> actions;
  };
  std::array<ButtonState, 2> buttons_;
};

}  // namespace lunactl
