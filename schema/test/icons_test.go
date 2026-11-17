package test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"testing"

	"github.com/hearthctl/lunactl/internal/testutil"
)

func TestIconEnumMatchesFirmware(t *testing.T) {
	raw, err := os.ReadFile("../manifest.v1.schema.json")
	if err != nil {
		t.Fatal(err)
	}
	var schema struct {
		Defs struct {
			Item struct {
				Properties struct {
					Icon struct{ Enum []string }
				}
			}
		} `json:"$defs"`
	}
	if err := json.Unmarshal(raw, &schema); err != nil {
		t.Fatal(err)
	}
	names := schema.Defs.Item.Properties.Icon.Enum
	if len(names) != 44 {
		t.Fatalf("expected 44 schema icons, got %d", len(names))
	}
	raw, err = os.ReadFile(filepath.Join(testutil.Root(), "esphome/lunactl/icons.h"))
	if err != nil {
		t.Fatal(err)
	}
	catalog := regexp.MustCompile(`(?s)\bICONS\[\]\s*=\s*\{(.*?)\};`).FindSubmatch(raw)
	if catalog == nil {
		t.Fatal("missing compiled icon catalog")
	}
	entries := regexp.MustCompile(`\{[^{}]*\}`).FindAll(catalog[1], -1)
	if len(entries) != len(names) {
		t.Fatalf("icons.h has %d entries, schema has %d", len(entries), len(names))
	}
	seen := map[string]bool{}
	for _, name := range names {
		if seen[name] {
			t.Fatalf("duplicate schema icon %q", name)
		}
		seen[name] = true
		t.Run(name, func(t *testing.T) {
			item := map[string]any{"label": "Icon", "color": "#123456", "icon": name, "action": map[string]any{"action": "script.example"}}
			manifest := map[string]any{"schema": 1, "pages": []any{map[string]any{"type": "single", "item": item}}}
			got := testutil.Host(t, []map[string]any{{"type": "connect"}, {"type": "fetch"}, {"type": "manifest", "manifest": manifest}})
			last := got["snapshots"].([]any)[2].(map[string]any)
			view, ok := last["item"].(map[string]any)
			if !ok || last["tappable"] != true || view["icon"] != name || view["glyph"] == "" || view["glyph"] == nil {
				t.Fatalf("schema icon did not resolve: %v", last)
			}
			// help-circle is selectable; it must never substitute for another name.
			if (view["glyph"] == "\U000f02d7") != (name == "mdi:help-circle") {
				t.Fatalf("unexpected help-circle glyph: %v", last)
			}
		})
	}
	if !seen["mdi:help-circle"] {
		t.Fatal("help-circle must remain selectable")
	}
}
