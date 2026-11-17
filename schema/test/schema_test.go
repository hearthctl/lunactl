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
	raw, err := os.ReadFile("../manifest.v1.schema.json")
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
	// Validate the actual household example, rather than a duplicated fixture.
	example, err := os.ReadFile(filepath.Join(testutil.Root(), "examples", "child-room.json"))
	if err != nil {
		t.Fatal(err)
	}
	if len(example) > 32*1024 {
		t.Fatal("household example exceeds the 32 KiB response limit")
	}
	cases = append(cases, manifestCase{"child-room-example", true, example})
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
	// Reuse the Single Item validation cases for Pie's optional center Item.
	for _, tc := range itemCases {
		var manifest map[string]any
		if err := json.Unmarshal(tc.Manifest, &manifest); err != nil || manifest == nil {
			continue
		}
		pages, ok := manifest["pages"].([]any)
		if !ok || len(pages) != 1 {
			continue
		}
		page, ok := pages[0].(map[string]any)
		if !ok || page["type"] != "single" || len(page) != 2 {
			continue
		}
		item, ok := page["item"]
		if !ok {
			continue
		}
		manifest["pages"] = []any{map[string]any{"type": "pie", "quarters": []any{nil, nil, nil, nil}, "center": item}}
		raw, err := json.Marshal(manifest)
		if err != nil {
			t.Fatal(err)
		}
		cases = append(cases, manifestCase{"center-" + tc.Name, tc.Valid, raw})
	}
	for i, center := range []any{nil, true, 42, "Item", []any{}, map[string]any{}} {
		raw, err := json.Marshal(map[string]any{"schema": 1, "pages": []any{map[string]any{
			"type": "pie", "quarters": []any{nil, nil, nil, nil}, "center": center,
		}}})
		if err != nil {
			t.Fatal(err)
		}
		cases = append(cases, manifestCase{fmt.Sprintf("center-invalid-type-%d", i), false, raw})
	}
	// Countdown references share the Item contract in both Page types.
	for _, tc := range []struct {
		name  string
		valid bool
		value any
	}{
		{"timer", true, "timer.example_2"},
		{"null", false, nil},
		{"empty", false, ""},
		{"missing-domain", false, "example"},
		{"wrong-domain", false, "sensor.example"},
		{"missing-id", false, "timer."},
		{"uppercase", false, "timer.Example"},
		{"extra-dot", false, "timer.example.more"},
		{"whitespace", false, "timer.example "},
		{"number", false, 1},
		{"bool", false, true},
		{"object", false, map[string]any{"entity": "timer.example"}},
		{"array", false, []any{"timer.example"}},
	} {
		for _, pageType := range []string{"single", "pie", "pie-center"} {
			item := map[string]any{"label": "Restzeit", "color": "#123456", "action": map[string]any{"action": "script.example"}, "countdown": tc.value}
			page := map[string]any{"type": pageType, "item": item}
			if pageType == "pie-center" {
				page["type"] = "pie"
				delete(page, "item")
				page["quarters"] = []any{nil, nil, nil, nil}
				page["center"] = item
			} else if pageType == "pie" {
				delete(page, "item")
				page["quarters"] = []any{item, nil, nil, nil}
			}
			raw, err := json.Marshal(map[string]any{"schema": 1, "pages": []any{page}})
			if err != nil {
				t.Fatal(err)
			}
			cases = append(cases, manifestCase{"countdown-" + pageType + "-" + tc.name, tc.valid, raw})
		}
	}
	// Values use the same contract in Single, Pie quarters and the center.
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
		for _, pageType := range []string{"single", "pie", "pie-center"} {
			item := map[string]any{"label": "Wert", "color": "#123456", "action": map[string]any{"action": "script.example"}, "value": tc.value}
			page := map[string]any{"type": pageType, "item": item}
			if pageType == "pie-center" {
				page["type"] = "pie"
				delete(page, "item")
				page["quarters"] = []any{nil, nil, nil, nil}
				page["center"] = item
			} else if pageType == "pie" {
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
	type displayCase struct {
		name  string
		valid bool
		value any
	}
	displayCases := []displayCase{
		{"empty", true, map[string]any{}},
		{"timeout", true, map[string]any{"timeout": 2.5}},
		{"minimum", true, map[string]any{"timeout": 0.001}},
		{"maximum", true, map[string]any{"timeout": 4294967.295}},
		{"brightness", true, map[string]any{"brightness": "input_number.display_brightness"}},
		{"both", true, map[string]any{"timeout": 10, "brightness": "sensor.brightness"}},
		{"unknown", false, map[string]any{"extra": true}},
	}
	for i, value := range []any{nil, true, "display", 1, []any{}} {
		displayCases = append(displayCases, displayCase{fmt.Sprintf("type-%d", i), false, value})
	}
	for i, value := range []any{nil, true, "10", 0, -1, 0.0009, 4294967.296, []any{}, map[string]any{}} {
		displayCases = append(displayCases, displayCase{fmt.Sprintf("timeout-invalid-%d", i), false, map[string]any{"timeout": value}})
	}
	for i, value := range []any{nil, true, 70, "", "sensor", "Sensor.brightness", "sensor.brightness.extra", []any{}, map[string]any{"entity": "sensor.brightness"}} {
		displayCases = append(displayCases, displayCase{fmt.Sprintf("brightness-invalid-%d", i), false, map[string]any{"brightness": value}})
	}
	for _, tc := range displayCases {
		var manifest map[string]any
		if err := json.Unmarshal(cases[0].Manifest, &manifest); err != nil {
			t.Fatal(err)
		}
		manifest["display"] = tc.value
		raw, err := json.Marshal(manifest)
		if err != nil {
			t.Fatal(err)
		}
		cases = append(cases, manifestCase{"display-" + tc.name, tc.valid, raw})
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
