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
