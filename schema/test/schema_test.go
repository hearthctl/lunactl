package test

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hearthctl/lunactl/internal/testutil"
	"github.com/santhosh-tekuri/jsonschema/v6"
)

func TestManifestSchemaAndCoreAgree(t *testing.T) {
	raw, err := os.ReadFile("../manifest.schema.json")
	if err != nil {
		t.Fatal(err)
	}
	var document any
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatal(err)
	}
	compiler := jsonschema.NewCompiler()
	if err := compiler.AddResource("manifest.json", document); err != nil {
		t.Fatal(err)
	}
	schema, err := compiler.Compile("manifest.json")
	if err != nil {
		t.Fatal(err)
	}
	raw, err = os.ReadFile(filepath.Join("..", "testdata", "cases.json"))
	if err != nil {
		t.Fatal(err)
	}
	type manifestCase struct {
		Name     string          `json:"name"`
		Valid    bool            `json:"valid"`
		Manifest json.RawMessage `json:"manifest"`
	}
	var cases []manifestCase
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	itemCases := append([]manifestCase(nil), cases...)
	addButtons := func(name string, valid bool, buttons any) {
		t.Helper()
		var manifest map[string]any
		if err := json.Unmarshal(cases[0].Manifest, &manifest); err != nil {
			t.Fatal(err)
		}
		manifest["buttons"] = buttons
		raw, err := json.Marshal(manifest)
		if err != nil {
			t.Fatal(err)
		}
		cases = append(cases, manifestCase{name, valid, raw})
	}
	addButtons("buttons-empty", true, map[string]any{})
	for _, value := range []any{nil, "a_short", []any{}, true, 1} {
		addButtons(fmt.Sprintf("buttons-type-%T", value), false, value)
	}
	addButtons("buttons-unknown-gesture", false, map[string]any{"a_double": map[string]any{"action": "script.example"}})
	all := map[string]any{}
	for _, key := range []string{"a_short", "a_long", "b_short", "b_long"} {
		all[key] = map[string]any{"action": "script." + key}
		addButtons(key+"-only", true, map[string]any{key: all[key]})
		// Every action/target/data case also applies to each key binding.
		for _, tc := range itemCases {
			if tc.Name != "optional-action-fields" && tc.Name != "selector-list-and-nested-data" &&
				!strings.HasPrefix(tc.Name, "action-") && !strings.HasPrefix(tc.Name, "target-") &&
				!strings.HasPrefix(tc.Name, "data-") && tc.Name != "null-target" && tc.Name != "null-data" &&
				tc.Name != "unknown-action-field" && tc.Name != "missing-action-name" {
				continue
			}
			var manifest map[string]any
			if err := json.Unmarshal(tc.Manifest, &manifest); err != nil {
				t.Fatal(err)
			}
			action := manifest["pages"].([]any)[0].(map[string]any)["item"].(map[string]any)["action"]
			addButtons(key+"-"+tc.Name, tc.Valid, map[string]any{key: action})
		}
		for _, value := range []any{nil, map[string]any{}, []any{}, true, 1} {
			addButtons(fmt.Sprintf("%s-type-%T", key, value), false, map[string]any{key: value})
		}
	}
	addButtons("buttons-all-gestures", true, all)
	// Values use the same contract in Single and every Pie quarter.
	type valueCase struct {
		name  string
		valid bool
		value any
	}
	valueCases := []valueCase{
		{"defaults", true, map[string]any{"format": "{0} °C", "refs": []any{map[string]any{"entity": "sensor.room"}}}},
		{"all-fields", true, map[string]any{"format": "{1} / {0}", "refs": []any{
			map[string]any{"entity": "sensor.room", "decimals": 1, "decimal_comma": true},
			map[string]any{"entity": "climate.room", "attribute": "hvac_action", "map": map[string]any{"heating": "Heizen", "idle": ""}},
		}}},
		{"null", false, nil},
		{"string", false, "{0}"},
		{"empty", false, map[string]any{}},
		{"missing-format", false, map[string]any{"refs": []any{map[string]any{"entity": "sensor.room"}}}},
		{"missing-refs", false, map[string]any{"format": "{0}"}},
		{"empty-format", false, map[string]any{"format": "", "refs": []any{map[string]any{"entity": "sensor.room"}}}},
		{"empty-refs", false, map[string]any{"format": "{0}", "refs": []any{}}},
		{"unknown-field", false, map[string]any{"format": "{0}", "refs": []any{map[string]any{"entity": "sensor.room"}}, "extra": 1}},
	}
	invalid := map[string][]any{
		"entity":        {nil, "", "room", "Sensor.room", 1},
		"attribute":     {nil, "", 1, []any{}},
		"decimals":      {nil, -1, 7, 1.5, "1", true},
		"decimal_comma": {nil, "true", 1},
		"map":           {nil, []any{}, "on", map[string]any{"on": 1}},
	}
	for _, field := range []string{"entity", "attribute", "decimals", "decimal_comma", "map"} {
		for i, invalidValue := range invalid[field] {
			ref := map[string]any{"entity": "sensor.room", field: invalidValue}
			valueCases = append(valueCases, valueCase{fmt.Sprintf("%s-invalid-%d", field, i), false, map[string]any{"format": "{0}", "refs": []any{ref}}})
		}
	}
	for _, ref := range []any{nil, "sensor.room", map[string]any{}, map[string]any{"entity": "sensor.room", "extra": true}} {
		valueCases = append(valueCases, valueCase{fmt.Sprintf("reference-invalid-%v", ref), false, map[string]any{"format": "{0}", "refs": []any{ref}}})
	}
	for _, tc := range valueCases {
		for _, pageType := range []string{"single", "pie"} {
			item := map[string]any{"label": "Wert", "color": "#123456", "action": map[string]any{"action": "script.example"}, "value": tc.value}
			page := map[string]any{"type": pageType, "item": item}
			if pageType == "pie" {
				delete(page, "item")
				page["quarters"] = []any{nil, nil, nil, item}
			}
			raw, err := json.Marshal(map[string]any{"schema": 1, "pages": []any{page}})
			if err != nil {
				t.Fatal(err)
			}
			cases = append(cases, manifestCase{"value-" + pageType + "-" + tc.name, tc.valid, raw})
		}
	}
	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			var manifest any
			if err := json.Unmarshal(tc.Manifest, &manifest); err != nil {
				t.Fatal(err)
			}
			if err := schema.Validate(manifest); (err == nil) != tc.Valid {
				t.Fatalf("schema: expected valid=%t, error=%v", tc.Valid, err)
			}
			got := testutil.Host(t, []map[string]any{{"type": "connect"}, {"type": "fetch"}, {"type": "manifest", "raw": string(tc.Manifest)}})
			last := got["snapshots"].([]any)[2].(map[string]any)
			if last["tappable"] != tc.Valid {
				t.Fatalf("core: expected valid=%t, got %v", tc.Valid, last)
			}
		})
	}
}
