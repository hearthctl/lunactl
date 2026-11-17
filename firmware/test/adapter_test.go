package test

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/hearthctl/lunactl/internal/testutil"
)

// Compile the production callback and field expressions, so changing the YAML
// response key or swapping the outgoing fields breaks this adapter check.
func TestProductionAdapter(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(testutil.Root(), "esphome/lunactl.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	extract := func(pattern string) string {
		t.Helper()
		match := regexp.MustCompile(pattern).FindStringSubmatch(string(raw))
		if match == nil {
			t.Fatalf("production adapter block missing: %s", pattern)
		}
		return match[1]
	}
	callback := extract(`(?s)capture_response: true\s+on_success:\s+- lambda: \|-\n(.*?)\n            - script.execute:`)
	fields := extract(`(?s)on_release:.*?action: script.lunactl_run\s+data:\n(.*?)\n                    on_error:`)
	expressions := regexp.MustCompile(`(?m)^\s+(action|data): !lambda ([^\n]+)$`).FindAllStringSubmatch(fields, -1)
	if len(expressions) != 2 {
		t.Fatal("expected two string field bindings")
	}
	var bindings strings.Builder
	for _, field := range expressions {
		fmt.Fprintf(&bindings, "out[\"%s\"] = [&]() -> std::string { %s }();\n", field[1], field[2])
	}
	source := `#include "core.h"
#include <iostream>
#define id(name) name
#define ESP_LOGW(tag, format, message) warnings.emplace_back(message)
int main() {
 lunactl::Core manifest_core;
 int tapped_slot = 0;
 std::vector<std::string> warnings;
 manifest_core.set_connected(true);
 uint32_t request = manifest_core.begin_fetch();
 JsonDocument envelope;
 deserializeJson(envelope, R"({"response":{"schema":1,"pages":[{"type":"single","item":{"label":"Adapter","color":"#123456","action":{"action":"script.adapter","target":{"entity_id":"script.expected"},"data":{"text":"quoted \\\" value"}}}}]}})");
 auto response = envelope.as<JsonObjectConst>();
 {
 ` + callback + `
 }
 if (!manifest_core.tappable()) return 1;
 JsonDocument out;
 ` + bindings.String() + `
 if (out.size() != 2 || !out["action"].is<const char *>() || !out["data"].is<const char *>()) return 2;
 if (out["action"] != "script.adapter") return 3;
 JsonDocument payload;
 if (deserializeJson(payload, out["data"].as<std::string>())) return 4;
 if (payload["target"]["entity_id"] != "script.expected" || payload["data"]["text"] != response["response"]["pages"][0]["item"]["action"]["data"]["text"]) return 5;
 if (!warnings.empty()) return 6;
 deserializeJson(envelope, R"({"response":{"schema":1,"pages":[{"type":"pie","quarters":[null,null,{"label":"Pie","icon":"mdi:future-icon","color":"#AABBCC","action":{"action":"script.pie","data":{"slot":2}}},null]}]}})");
 response = envelope.as<JsonObjectConst>();
 {
 ` + callback + `
 }
 if (warnings.size() != 1 || warnings[0] != "Invalid Item icon" || manifest_core.pie() || manifest_core.item().label != "Adapter") return 7;
 warnings.clear();
 envelope["response"]["pages"][0]["quarters"][2]["icon"] = "mdi:sofa";
 {
 ` + callback + `
 }
 if (!warnings.empty() || !manifest_core.pie()) return 14;
 manifest_core.press(336, 336);
 tapped_slot = manifest_core.release(336, 336);
 if (tapped_slot != 2) return 8;
 out.clear();
 ` + bindings.String() + `
 if (out["action"] != "script.pie" || deserializeJson(payload, out["data"].as<std::string>())) return 9;
 if (payload["data"]["slot"] != 2 || payload["target"].size() != 0) return 10;
 deserializeJson(envelope, R"({"response":{"schema":1,"pages":[{"type":"pie","quarters":[null,null,null,null],"center":{"label":"Center","color":"#111827","action":{"action":"script.center","target":{"entity_id":"script.expected"},"data":{"slot":"center"}}}}]}})");
 response = envelope.as<JsonObjectConst>();
 {
 ` + callback + `
 }
 manifest_core.press(233, 233);
 tapped_slot = manifest_core.release(233, 233);
 if (tapped_slot != 4) return 11;
 out.clear();
 ` + bindings.String() + `
 if (out["action"] != "script.center" || deserializeJson(payload, out["data"].as<std::string>())) return 12;
 if (payload["target"]["entity_id"] != "script.expected" || payload["data"]["slot"] != "center") return 13;

}
`
	checkAdapter(t, source)
}

func checkAdapter(t *testing.T, source string, headers ...map[string]string) {
	t.Helper()
	dir := t.TempDir()
	for _, files := range headers {
		for name, content := range files {
			if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0600); err != nil {
				t.Fatal(err)
			}
		}
	}
	file := filepath.Join(dir, "adapter.cpp")
	if err := os.WriteFile(file, []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	binary := filepath.Join(dir, "adapter")
	compiler := os.Getenv("CXX")
	if compiler == "" {
		compiler = "c++"
	}
	cmd := exec.Command(compiler, "-std=c++17", "-Wall", "-Wextra", "-Werror", "-I"+dir, "-I"+filepath.Join(testutil.Root(), ".build/include"), "-I"+filepath.Join(testutil.Root(), "esphome/lunactl"), file, "-o", binary)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("compile adapter: %v\n%s", err, out)
	}
	if out, err := exec.Command(binary).CombinedOutput(); err != nil {
		t.Fatalf("adapter contract: %v\n%s", err, out)
	}
}

// Compile and exercise the actual touch lambdas with the widget-relative point
// argument supplied by ESPHome 2026.10.2. The firmware build checks that generated
// signature too; golden core cases alone cannot check the YAML wiring.
func TestProductionTouchAdapter(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(testutil.Root(), "esphome/lunactl.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	match := regexp.MustCompile(`(?s)        on_press:\n          - lambda: \|-\n(.*?)\n        on_release:\n          - lambda: \|-\n(.*?)\n          - script.execute: render_manifest`).FindStringSubmatch(string(raw))
	if match == nil {
		t.Fatal("missing touch press/release callbacks")
	}
	source := `#include "core.h"
#define id(name) name
struct lv_point_t { int x, y; };
uint32_t millis() { return 0; }
struct { void execute() {} } wake_display;
int main() {
 lunactl::Core manifest_core;
 int tapped_slot = -1;
 struct UI {
   int slot = -1;
   void highlight(const lunactl::Core &core, int x, int y) { slot = core.hit(x, y); }
 } page_ui;
 auto press = [&](lv_point_t point) { ` + match[1] + ` };
 auto release = [&](lv_point_t point) { ` + match[2] + ` };
 manifest_core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"pages":[{"type":"pie","quarters":[{"label":"First","color":"#123456","action":{"action":"script.first"}},null,{"label":"Third","color":"#ABCDEF","action":{"action":"script.third"}},null]},{"type":"single","item":{"label":"Second page","color":"#654321","action":{"action":"script.second"}}}]})";
 if (!manifest_core.accept_json(manifest_core.begin_fetch(), manifest, error)) return 1;
 press({130, 130});
 if (page_ui.slot != 0) return 2;
 release({130, 130});
 if (tapped_slot != 0 || manifest_core.item(tapped_slot).action != "script.first") return 3;
 press({336, 336});
 if (page_ui.slot != 2) return 4;
 release({336, 336});
 if (tapped_slot != 2 || manifest_core.item(tapped_slot).action != "script.third") return 5;
 for (lv_point_t point : {lv_point_t{336, 130}, {130, 336}, {233, 233}, {233, 100}}) {
   press(point);
   release(point);
   if (page_ui.slot != -1 || tapped_slot != -1) return 6;
 }
 press({336, 130});
 release({130, 130});
 if (tapped_slot != -1 || manifest_core.page_index() != 1) return 7;
 press({233, 233});
 release({233, 233});
 if (tapped_slot != 0 || manifest_core.item(tapped_slot).action != "script.second") return 8;
 // A dot selects home without running an Item.
 lv_point_t dot{manifest_core.dots_left() + 15, 451};
 press(dot);
 release(dot);
 if (tapped_slot != -1 || manifest_core.page_index() != 0) return 9;
 // A touch spanning a replacement must not run the new Manifest's action.
 press({130, 130});
 if (!manifest_core.accept_json(manifest_core.begin_fetch(), manifest, error)) return 10;
 release({130, 130});
 if (tapped_slot != -1) return 11;
 manifest_core.set_connected(false);
 press({130, 130});
 release({130, 130});
 if (page_ui.slot != -1 || tapped_slot != -1) return 12;
 manifest_core.set_connected(true);
 if (!manifest_core.accept_json(manifest_core.begin_fetch(), R"({"schema":1,"pages":[{"type":"pie","quarters":[{"label":"Quarter","color":"#123456","action":{"action":"script.quarter"}},null,null,null],"center":{"label":"Center","color":"#111827","action":{"action":"script.center"}}}]})", error)) return 13;
 press({233, 233});
 if (page_ui.slot != 4) return 14;
 release({233, 233});
 if (tapped_slot != 4 || manifest_core.item(tapped_slot).action != "script.center") return 15;
 press({90, 90});
 release({90, 90});
 if (tapped_slot != 0 || manifest_core.item(tapped_slot).action != "script.quarter") return 16;
 for (lv_point_t point : {lv_point_t{233, 20}, {233, 80}, {440, 233}, {376, 90}, {390, 233}}) {
   press(point);
   release(point);
   if (page_ui.slot != -1 || tapped_slot != -1) return 17;
 }
}
`
	checkAdapter(t, source)
}

// Exercise the production API conditions and actions with overlapping HA clients.
func TestOverlappingHomeAssistantClients(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(testutil.Root(), "esphome/lunactl.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	handler := func(event string) string {
		t.Helper()
		pattern := `(?s)  on_client_` + event + `:\n.*?lambda: '([^'\n]+)'\n        then:\n(.*?)(?:\n\n|\n  on_client_)`
		match := regexp.MustCompile(pattern).FindStringSubmatch(string(raw))
		if match == nil {
			t.Fatalf("missing %s handler", event)
		}
		var actions strings.Builder
		for _, line := range strings.Split(match[2], "\n") {
			line = strings.TrimSpace(line)
			switch {
			case strings.HasPrefix(line, "- lambda: "):
				actions.WriteString(strings.TrimPrefix(line, "- lambda: ") + "\n")
			case line == "- script.execute: manifest_on_connect":
				actions.WriteString("pending = true; ++starts;\n")
			case line == "- script.stop: manifest_on_connect":
				actions.WriteString("pending = false; ++stops;\n")
			case line == "- script.execute: render_manifest", line == "":
			default:
				t.Fatalf("unsupported API action: %s", line)
			}
		}
		return "if ([&]() { " + match[1] + " }()) {\n" + actions.String() + "}\n"
	}
	source := `#include "core.h"
#define id(name) name
int main() {
 lunactl::Core manifest_core;
 unsigned int ha_clients = 0;
 bool pending = false;
 int starts = 0, stops = 0;
 auto connect = [&](std::string client_info) { ` + handler("connected") + ` };
 auto disconnect = [&](std::string client_info) { ` + handler("disconnected") + ` };
 connect("esphome logs");
 disconnect("esphome logs");
 disconnect("Home Assistant stray");
 if (ha_clients || manifest_core.connected() || starts || stops) return 1;
 connect("Home Assistant first");
 uint32_t request = manifest_core.begin_fetch();
 connect("Home Assistant second");
 disconnect("Home Assistant first");
 if (!pending || starts != 1 || stops || !manifest_core.current(request)) return 2;
 std::string error;
 if (!manifest_core.accept_json(request, R"({"schema":1,"pages":[{"type":"single","item":{"label":"Overlap","color":"#123456","action":{"action":"script.test"}}}]})", error)) return 3;
 if (!manifest_core.tappable() || !manifest_core.begin_fetch()) return 4;
 connect("esphome logs");
 disconnect("esphome logs");
 if (!manifest_core.tappable() || ha_clients != 1) return 5;
 disconnect("Home Assistant second");
 if (pending || stops != 1 || manifest_core.connected() || manifest_core.tappable() || manifest_core.current(request)) return 6;
 connect("Home Assistant third");
 connect("Home Assistant fourth");
 disconnect("Home Assistant fourth");
 if (!pending || !manifest_core.tappable() || starts != 2 || stops != 1) return 7;
 disconnect("Home Assistant third");
 if (pending || manifest_core.connected() || ha_clients || stops != 2) return 8;
}
`
	checkAdapter(t, source)
}

// The icon names/glyphs in the golden are the catalog contract. A name can be
// resolved correctly by the core while its glyph is accidentally left out of
// the compiled font, producing a blank icon on the device.
func TestIconFontCoversGoldenGlyphs(t *testing.T) {
	raw, err := os.ReadFile("testdata/icons.json")
	if err != nil {
		t.Fatal(err)
	}
	var golden struct {
		Want struct {
			Snapshots []struct {
				Quarters []struct{ Icon, Glyph string }
			}
		}
	}
	if err := json.Unmarshal(raw, &golden); err != nil {
		t.Fatal(err)
	}
	want := map[string]string{}
	for _, snapshot := range golden.Want.Snapshots {
		for _, quarter := range snapshot.Quarters {
			want[quarter.Icon] = quarter.Glyph
		}
	}
	raw, err = os.ReadFile(filepath.Join(testutil.Root(), "esphome/lunactl.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, match := range regexp.MustCompile(`(?m)^\s+- "\\U([0-9A-Fa-f]{8})" # (mdi:[a-z0-9-]+)$`).FindAllStringSubmatch(string(raw), -1) {
		codepoint, err := strconv.ParseInt(match[1], 16, 32)
		if err != nil {
			t.Fatal(err)
		}
		got[match[2]] = string(rune(codepoint))
	}
	if len(want) != 44 || !reflect.DeepEqual(got, want) {
		t.Fatalf("compiled icon font differs from the 44-icon golden: got %v, want %v", got, want)
	}
}

// Exercise the actual polling, wake and action-field expressions with a dark
// display. The golden cases exercise the core; this checks the device wiring.
func TestProductionButtonAdapter(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(testutil.Root(), "esphome/lunactl.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	extract := func(pattern string) string {
		t.Helper()
		match := regexp.MustCompile(pattern).FindStringSubmatch(string(raw))
		if match == nil {
			t.Fatalf("button adapter missing: %s", pattern)
		}
		return match[1]
	}
	handle := extract(`(?s)  - id: handle_key\n.*?lambda: \|-\n(.*?)\n  - id:`)
	wake := extract(`(?s)  - id: wake_display\n.*?lambda: \|-\n(.*?)\n  - id:`)
	fields := extract(`(?s)  - id: run_button_action\n.*?action: script.lunactl_run\s+data:\n(.*?)\n          on_error:`)
	var bindings strings.Builder
	for _, field := range regexp.MustCompile(`(?m)^\s+(action|data): !lambda ([^\n]+)$`).FindAllStringSubmatch(fields, -1) {
		fmt.Fprintf(&bindings, "out[\"%s\"] = [&]() -> std::string { %s }();\n", field[1], field[2])
	}
	poll := extract(`(?s)interval:\n(.*?)\nbutton:`)
	var polling strings.Builder
	for _, key := range regexp.MustCompile(`id: handle_key\s+key: ([01])\s+pressed: !lambda ([^\n]+)`).FindAllStringSubmatch(poll, -1) {
		fmt.Fprintf(&polling, "handle_key(%s, [&]() -> bool { %s }());\n", key[1], key[2])
	}
	if strings.Count(polling.String(), "handle_key(") != 2 || !strings.Contains(poll, "interval: 10ms") {
		t.Fatal("expected both keys to be polled every 10 ms")
	}
	for _, key := range []struct{ id, pin string }{{"key_a", "GPIO2"}, {"key_b", "GPIO1"}} {
		block := extract(`(?s)    id: ` + key.id + `\n(.*?)\n      - delayed_on_off: 10ms`)
		for _, setting := range []string{"internal: true", "number: " + key.pin, "mode: INPUT", "inverted: true"} {
			if !strings.Contains(block, setting) {
				t.Fatalf("%s missing %s", key.id, setting)
			}
		}
	}
	source := `#include "core.h"
#include <vector>
#define id(name) name
uint32_t now = 0;
uint32_t millis() { return now; }
lunactl::Core manifest_core;
struct Sensor { bool state{false}; } key_a, key_b;
struct Display {
 int brightness{0};
 void set_brightness(int value) { brightness = value; }
} amoled;
struct UI {
 bool paused{true};
 int wakes{0};
 void set_paused(bool value, bool) { paused = value; ++wakes; }
} manifest_ui;
struct Wake { void execute() { ` + wake + ` } } wake_display;
struct Runner {
 std::vector<std::string> actions, payloads;
 void execute(std::string action, std::string data) {
   JsonDocument out;
   ` + bindings.String() + `
   if (out.size() != 2 || !out["action"].is<const char *>() || !out["data"].is<const char *>()) std::exit(1);
   actions.push_back(out["action"].as<std::string>());
   payloads.push_back(out["data"].as<std::string>());
 }
} run_button_action;
void handle_key(uint8_t key, bool pressed) { ` + handle + ` }
void poll() { ` + polling.String() + ` }
int main() {
 JsonDocument manifest;
 deserializeJson(manifest, R"({"schema":1,"pages":[{"type":"single","item":{"label":"Keys","color":"#123456","action":{"action":"script.item"}}}],"buttons":{}})");
 const char *names[] = {"a_short", "a_long", "b_short", "b_long"};
 for (auto name : names) {
   manifest["buttons"][name]["action"] = std::string("script.") + name;
   manifest["buttons"][name]["target"]["entity_id"] = "script.expected";
   manifest["buttons"][name]["data"]["text"] = "Grüße \"quoted\"\n";
 }
 manifest_core.set_connected(true);
 std::string error;
 if (!manifest_core.accept(manifest_core.begin_fetch(), manifest, error)) return 2;
 for (int gesture = 0; gesture < 4; ++gesture) {
   auto &sensor = gesture < 2 ? key_a : key_b;
   manifest_core.sleep();
   wake_display.execute();
   manifest_ui.paused = true;
   int wakes_before = manifest_ui.wakes;
   sensor.state = true;
   now += 2000;
   poll();
   if (amoled.brightness != 179 || manifest_ui.paused || manifest_ui.wakes != wakes_before + 1) return 3;
   if (run_button_action.actions.size() != static_cast<size_t>(gesture)) return 4;
   now += 999;
   poll();
   if (run_button_action.actions.size() != static_cast<size_t>(gesture)) return 5;
   if (gesture % 2) { ++now; poll(); }
   sensor.state = false;
   poll();
   poll();
   if (run_button_action.actions.size() != static_cast<size_t>(gesture + 1)) return 6;
   if (run_button_action.actions.back() != std::string("script.") + names[gesture]) return 7;
   JsonDocument payload;
   if (deserializeJson(payload, run_button_action.payloads.back())) return 8;
   if (payload["target"]["entity_id"] != "script.expected" || payload["data"]["text"] != "Grüße \"quoted\"\n") return 9;
 }
 // Unbound keys wake even without HA or a Manifest, but send no action.
 manifest_core = lunactl::Core{};
 for (auto sensor : {&key_a, &key_b}) {
   manifest_core.sleep();
   wake_display.execute();
   manifest_ui.paused = true;
   sensor->state = true;
   poll();
   if (amoled.brightness != 179 || manifest_ui.paused) return 10;
   now += 1000;
   poll();
   sensor->state = false;
   poll();
 }
 if (run_button_action.actions.size() != 4) return 11;
}
`
	checkAdapter(t, source)
}
