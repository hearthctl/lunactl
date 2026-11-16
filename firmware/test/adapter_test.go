package test

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
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
	fields := extract(`(?s)action: script.lunactl_run\s+data:\n(.*?)\n                    on_error:`)
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
#define ESP_LOGW(...) ((void)0)
int main() {
 lunactl::Core manifest_core;
 manifest_core.set_connected(true);
 uint32_t request = manifest_core.begin_fetch();
 JsonDocument envelope;
 deserializeJson(envelope, R"({"response":{"schema":1,"pages":[{"type":"single","item":{"label":"Adapter","color":"#123456","action":{"action":"script.adapter","target":{"entity_id":"script.expected"},"data":{"text":"quoted \\\" value"}}}}]}})");
 auto response = envelope.as<JsonObjectConst>();
 ` + callback + `
 if (!manifest_core.tappable()) return 1;
 JsonDocument out;
 ` + bindings.String() + `
 if (out.size() != 2 || !out["action"].is<const char *>() || !out["data"].is<const char *>()) return 2;
 if (out["action"] != "script.adapter") return 3;
 JsonDocument payload;
 if (deserializeJson(payload, out["data"].as<std::string>())) return 4;
 if (payload["target"]["entity_id"] != "script.expected" || payload["data"]["text"] != response["response"]["pages"][0]["item"]["action"]["data"]["text"]) return 5;
}
`
	checkAdapter(t, source)
}

func checkAdapter(t *testing.T, source string) {
	t.Helper()
	dir := t.TempDir()
	file := filepath.Join(dir, "adapter.cpp")
	if err := os.WriteFile(file, []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	binary := filepath.Join(dir, "adapter")
	compiler := os.Getenv("CXX")
	if compiler == "" {
		compiler = "c++"
	}
	cmd := exec.Command(compiler, "-std=c++17", "-Wall", "-Wextra", "-Werror", "-I"+filepath.Join(testutil.Root(), ".build/include"), "-I"+filepath.Join(testutil.Root(), "esphome/lunactl"), file, "-o", binary)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("compile adapter: %v\n%s", err, out)
	}
	if out, err := exec.Command(binary).CombinedOutput(); err != nil {
		t.Fatalf("adapter contract: %v\n%s", err, out)
	}
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
