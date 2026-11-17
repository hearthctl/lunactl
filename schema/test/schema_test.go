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
