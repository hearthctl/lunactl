package test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/hearthctl/lunactl/internal/testutil"
)

func TestCoreGolden(t *testing.T) {
	files, err := filepath.Glob("testdata/*.json")
	if err != nil || len(files) == 0 {
		t.Fatal("missing golden cases", err)
	}
	for _, file := range files {
		t.Run(filepath.Base(file), func(t *testing.T) {
			raw, err := os.ReadFile(file)
			if err != nil {
				t.Fatal(err)
			}
			var tc struct {
				Events  []map[string]any `json:"events"`
				Display bool             `json:"display"`
				Want    map[string]any   `json:"want"`
			}
			decoder := json.NewDecoder(bytes.NewReader(raw))
			decoder.UseNumber()
			if err := decoder.Decode(&tc); err != nil {
				t.Fatal(err)
			}
			got := testutil.Host(t, tc.Events, tc.Display)
			// JSON text is the wire contract; member order inside it is immaterial.
			for _, result := range []map[string]any{got, tc.Want} {
				for _, value := range result["snapshots"].([]any) {
					if call, ok := value.(map[string]any)["call"].(map[string]any); ok {
						text, ok := call["data"].(string)
						if !ok {
							t.Fatal("action data must be JSON text")
						}
						var payload any
						decoder := json.NewDecoder(strings.NewReader(text))
						decoder.UseNumber()
						if err := decoder.Decode(&payload); err != nil {
							t.Fatal(err)
						}
						call["data"] = payload
					}
				}
			}
			if !reflect.DeepEqual(got, tc.Want) {
				actual, _ := json.MarshalIndent(got, "", "  ")
				t.Errorf("golden mismatch\ngot: %s\nwant: %s", actual, raw)
			}
		})
	}
}

func TestManifestSize(t *testing.T) {
	// The boundary applies to bytes, including JSON whitespace, not characters.
	base := `{"schema":1,"pages":[{"type":"single","item":{"label":"Grüße","color":"#ab12EF","action":{"action":"script.example"}}}]}`
	for _, size := range []int{32768, 32769} {
		t.Run(fmt.Sprint(size), func(t *testing.T) {
			manifest := base + strings.Repeat(" ", size-len(base))
			got := testutil.Host(t, []map[string]any{{"type": "connect"}, {"type": "fetch"}, {"type": "manifest", "raw": manifest}})
			last := got["snapshots"].([]any)[2].(map[string]any)
			if last["tappable"] != (size == 32768) {
				t.Fatalf("size %d: %v", size, last)
			}
		})
	}
	// API response callbacks hand the core an already-parsed object. Exercise
	// that path too, including UTF-8 bytes, rather than only the host parser.
	for _, size := range []int{32768, 32769} {
		t.Run("response-"+fmt.Sprint(size), func(t *testing.T) {
			manifest := map[string]any{}
			if err := json.Unmarshal([]byte(base), &manifest); err != nil {
				t.Fatal(err)
			}
			item := manifest["pages"].([]any)[0].(map[string]any)["item"].(map[string]any)
			item["label"] = "Grüße" + strings.Repeat("a", size-len(base))
			got := testutil.Host(t, []map[string]any{{"type": "connect"}, {"type": "fetch"}, {"type": "manifest", "manifest": manifest}})
			last := got["snapshots"].([]any)[2].(map[string]any)
			if last["tappable"] != (size == 32768) {
				t.Fatalf("response size %d: %v", size, last["error"])
			}
		})
	}
}
