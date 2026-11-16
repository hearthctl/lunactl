package test

import (
	"encoding/json"
	"os"
	"path/filepath"
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
	var cases []struct {
		Name     string `json:"name"`
		Valid    bool   `json:"valid"`
		Manifest any    `json:"manifest"`
	}
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			if err := schema.Validate(tc.Manifest); (err == nil) != tc.Valid {
				t.Fatalf("schema: expected valid=%t, error=%v", tc.Valid, err)
			}
			got := testutil.Host(t, []map[string]any{{"type": "connect"}, {"type": "fetch"}, {"type": "manifest", "manifest": tc.Manifest}})
			last := got["snapshots"].([]any)[2].(map[string]any)
			if last["tappable"] != tc.Valid {
				t.Fatalf("core: expected valid=%t, got %v", tc.Valid, last)
			}
		})
	}
}
