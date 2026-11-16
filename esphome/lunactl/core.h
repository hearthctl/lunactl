#pragma once

// Platform independent: the host and ESPHome use the same parser and state machine.
#include <ArduinoJson.h>
#include <cstdint>
#include <initializer_list>
#include <string>
#include <utility>

namespace lunactl {

constexpr size_t MAX_MANIFEST_BYTES = 32 * 1024;

struct Item {
  std::string label;
  std::string color;
  uint32_t rgb{0};
  std::string action;
  // lunactl_run's JSON-text field contains the complete target/data pair.
  std::string data;
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

inline bool parse_manifest(JsonVariantConst root, Item &item, std::string &error) {
  auto reject = [&error](const char *message) { error = message; return false; };
  if (measureJson(root) > MAX_MANIFEST_BYTES) return reject("Manifest exceeds 32 KiB");
  if (!keys(root, {"schema", "pages"})) return reject("Invalid Manifest fields");
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
  auto action = source["action"];
  if (!keys(action, {"action", "target", "data"}) || !action_name(action["action"]))
    return reject("Invalid Item action");
  if (!action["target"].isNull() && !target_valid(action["target"])) return reject("Invalid action target");
  if (!action["target"].isUnbound() && action["target"].isNull())
    return reject("Invalid action target");
  if (!action["data"].isUnbound() && !action["data"].is<JsonObjectConst>())
    return reject("Invalid action data");

  JsonDocument payload;
  if (action["target"].isNull()) payload["target"].to<JsonObject>();
  else payload["target"] = action["target"];
  if (action["data"].isNull()) payload["data"].to<JsonObject>();
  else payload["data"] = action["data"];
  Item candidate;
  candidate.label = source["label"].as<std::string>();
  candidate.color = color;
  candidate.rgb = rgb;
  candidate.action = action["action"].as<std::string>();
  serializeJson(payload, candidate.data);
  item = std::move(candidate);
  error.clear();
  return true;
}

class Core {
 public:
  void set_connected(bool connected) {
    if (connected_ == connected) return;
    connected_ = connected;
    ++request_;  // Invalidates replies from an earlier connection.
    // Keep the last valid Manifest in RAM; an invalid replacement must not
    // destroy it, including after reconnect. Offline it is hidden and inert.
  }
  bool connected() const { return connected_; }
  uint32_t begin_fetch() { return connected_ ? ++request_ : 0; }
  bool current(uint32_t request) const { return connected_ && request != 0 && request == request_; }
  bool accept(uint32_t request, JsonVariantConst root, std::string &error) {
    if (!current(request)) { error = "Stale Manifest response"; return false; }
    Item candidate;
    if (!parse_manifest(root, candidate, error)) return false;
    item_ = std::move(candidate);
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
  const Item &item() const { return item_; }
  const char *status() const { return !connected_ ? "Keine Verbindung" : has_manifest_ ? "" : "Kein Manifest"; }

 private:
  bool connected_{false};
  bool has_manifest_{false};
  uint32_t request_{0};
  Item item_;
};

}  // namespace lunactl
