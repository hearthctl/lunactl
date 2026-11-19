package test

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/hearthctl/lunactl/internal/testutil"
)

// The response template keeps ESPHome's envelope shallow. The actual callback
// then lets Core reject a deep Manifest without losing ArduinoJson's reason.
func TestDeviceNestingLimit(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(testutil.Root(), "esphome/lunactl.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	callback := regexp.MustCompile(`(?s)capture_response: true\s+on_success:\s+- lambda: \|-\n(.*?)\n            - script.execute:`).FindStringSubmatch(string(raw))
	if callback == nil {
		t.Fatal("missing Manifest success callback")
	}
	block := regexp.MustCompile(`(?s)\n  build_flags:\n(.*?)\n  [a-z]`).FindStringSubmatch(string(raw))
	if block == nil {
		t.Fatal("esphome build_flags missing")
	}
	var flags []string
	for _, match := range regexp.MustCompile(`(?m)^    - (-D\S+)$`).FindAllStringSubmatch(block[1], -1) {
		flags = append(flags, match[1])
	}

	tests := []struct {
		name     string
		manifest string
		accepted bool
	}{
		{
			name:     "scene.apply with color list, depth 10",
			manifest: `{"schema":1,"pages":[{"type":"pie","quarters":[{"label":"Schlafen","color":"#573382","action":{"action":"scene.apply","data":{"entities":{"light.bett":{"state":"on","brightness":3,"rgb_color":[0,0,255]}}}}},null,null,null]}]}`,
			accepted: true,
		},
		{
			name:     "depth 31, deepest supported Manifest",
			manifest: `{"schema":1,"pages":[{"type":"single","item":{"label":"Tief","color":"#123456","action":{"action":"script.deep","data":` + strings.Repeat(`{"n":`, 25) + `{}` + strings.Repeat(`}`, 25) + `}}}]}`,
			accepted: true,
		},
		{
			name:     "depth 32 rejected with TooDeep on the display",
			manifest: `{"schema":1,"pages":[{"type":"single","item":{"label":"Tief","color":"#123456","action":{"action":"script.deep","data":` + strings.Repeat(`{"n":`, 26) + `{}` + strings.Repeat(`}`, 26) + `}}}]}`,
			accepted: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			source := `#include "core.h"
#define id(name) name
#define ESP_LOGW(tag, format, message) (void)message
#include <iostream>
int main() {
 lunactl::Core manifest_core;
 manifest_core.set_connected(true);
 uint32_t request = manifest_core.begin_fetch();
 JsonDocument envelope;
 envelope["response"]["manifest_json"] = R"(` + tt.manifest + `)";
 std::string data;
 serializeJson(envelope, data);
 JsonDocument doc;
 if (deserializeJson(doc, data.data(), data.size())) return 1;
 auto response = doc.as<JsonObjectConst>();
 ` + callback[1] + `
 std::cout << manifest_core.tappable() << "\n" << manifest_core.status();
}
`
			dir := t.TempDir()
			file := filepath.Join(dir, "nesting.cpp")
			if err := os.WriteFile(file, []byte(source), 0600); err != nil {
				t.Fatal(err)
			}
			binary := filepath.Join(dir, "nesting")
			compiler := os.Getenv("CXX")
			if compiler == "" {
				compiler = "c++"
			}
			args := append([]string{"-std=c++17", "-Wall", "-Wextra", "-Werror", "-I" + filepath.Join(testutil.Root(), ".build/include"), "-I" + filepath.Join(testutil.Root(), "esphome/lunactl")}, flags...)
			if out, err := exec.Command(compiler, append(args, file, "-o", binary)...).CombinedOutput(); err != nil {
				t.Fatalf("compile: %v\n%s", err, out)
			}
			out, err := exec.Command(binary).CombinedOutput()
			if err != nil {
				t.Fatalf("run: %v\n%s", err, out)
			}
			want := "1\n"
			if !tt.accepted {
				want = "0\nManifest abgelehnt\nInvalid JSON: TooDeep"
			}
			if string(out) != want {
				t.Errorf("display = %q, want %q", out, want)
			}
		})
	}
}
