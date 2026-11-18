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

// ESPHome parses the lunactl.manifest response envelope with deserializeJson
// and no explicit NestingLimit (components/json/json_util.cpp), so the device
// limit is ArduinoJson's default, set by the build flags in lunactl.yaml.
func TestDeviceNestingLimit(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(testutil.Root(), "esphome/lunactl.yaml"))
	if err != nil {
		t.Fatal(err)
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
			name:     "depth 31, deepest Manifest inside the envelope",
			manifest: `{"schema":1,"pages":[{"type":"single","item":{"label":"Tief","color":"#123456","action":{"action":"script.deep","data":` + strings.Repeat(`{"n":`, 25) + `{}` + strings.Repeat(`}`, 25) + `}}}]}`,
			accepted: true,
		},
		{
			name:     "depth 32 exceeds the limit with the envelope",
			manifest: `{"schema":1,"pages":[{"type":"single","item":{"label":"Tief","color":"#123456","action":{"action":"script.deep","data":` + strings.Repeat(`{"n":`, 26) + `{}` + strings.Repeat(`}`, 26) + `}}}]}`,
			accepted: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			want := "1"
			if !tt.accepted {
				want = "0"
			}
			source := `#include "core.h"
#include <iostream>
int main() {
 lunactl::Core core;
 core.set_connected(true);
 uint32_t request = core.begin_fetch();
 std::string data = R"({"response":` + tt.manifest + `})";
 JsonDocument doc;
 std::string error;
 bool ok = !deserializeJson(doc, data.data(), data.size()) && core.accept(request, doc["response"], error);
 std::cout << ok;
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
			if string(out) != want {
				t.Errorf("accepted = %s, want %s", out, want)
			}
		})
	}
}
