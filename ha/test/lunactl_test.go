// Tests for the lunactl HA package. They run against the disposable Home
// Assistant started by run.sh, which sets HA_URL and HA_TOKEN.
package test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

const (
	decke = "light.decke"
	bett  = "light.bett"
)

// light is the observable state of a light. Brightness and colour
// temperature are nil while the light is off.
type light struct {
	State           string `json:"state"`
	Brightness      *int   `json:"brightness,omitempty"`
	ColorTempKelvin *int   `json:"color_temp_kelvin,omitempty"`
}

func TestLichtSzenen(t *testing.T) {
	testCases := []struct {
		name   string
		given  map[string]map[string]any
		script string
		golden string
	}{
		{
			name: "Hell from all off",
			given: map[string]map[string]any{
				decke: nil,
				bett:  nil,
			},
			script: "script.lunactl_hell",
			golden: "hell.json",
		},
		{
			name: "Lesen from Hell",
			given: map[string]map[string]any{
				decke: {"brightness_pct": 100, "color_temp_kelvin": 4000},
				bett:  {"brightness_pct": 100, "color_temp_kelvin": 4000},
			},
			script: "script.lunactl_lesen",
			golden: "lesen.json",
		},
		{
			name: "Gemütlich from all off",
			given: map[string]map[string]any{
				decke: nil,
				bett:  nil,
			},
			script: "script.lunactl_gemuetlich",
			golden: "gemuetlich.json",
		},
		{
			name: "Schlafen gehen from Hell",
			given: map[string]map[string]any{
				decke: {"brightness_pct": 100, "color_temp_kelvin": 4000},
				bett:  {"brightness_pct": 100, "color_temp_kelvin": 4000},
			},
			script: "script.lunactl_schlafen_gehen",
			golden: "schlafen_gehen.json",
		},
		{
			name: "Taste A with Decke on leads to Schlafen gehen",
			given: map[string]map[string]any{
				decke: {"brightness_pct": 80, "color_temp_kelvin": 2700},
				bett:  {"brightness_pct": 80, "color_temp_kelvin": 2700},
			},
			script: "script.lunactl_taste_a",
			golden: "schlafen_gehen.json",
		},
		{
			name: "Taste A with Decke off leads to Gemütlich",
			given: map[string]map[string]any{
				decke: nil,
				bett:  {"brightness_pct": 8, "color_temp_kelvin": 2700},
			},
			script: "script.lunactl_taste_a",
			golden: "gemuetlich.json",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			for entityID, data := range tc.given {
				if data == nil {
					callAction(t, "light.turn_off", map[string]any{"entity_id": entityID})
					continue
				}
				data["entity_id"] = entityID
				callAction(t, "light.turn_on", data)
			}

			callAction(t, tc.script, nil)

			got := map[string]light{
				decke: lightState(t, decke),
				bett:  lightState(t, bett),
			}
			var want map[string]light
			raw, err := os.ReadFile(filepath.Join("testdata", tc.golden))
			if err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(raw, &want); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, want) {
				gotJSON, _ := json.MarshalIndent(got, "", "  ")
				t.Errorf("light states differ from %s\ngot:\n%s\nwant:\n%s", tc.golden, gotJSON, raw)
			}
		})
	}
}

// callAction calls an HA action such as "light.turn_on" and waits until it is done.
func callAction(t *testing.T, action string, data map[string]any) {
	t.Helper()
	domain, service, _ := strings.Cut(action, ".")
	body, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	resp := request(t, http.MethodPost, fmt.Sprintf("/api/services/%s/%s", domain, service), body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("%s: HTTP %d", action, resp.StatusCode)
	}
}

func lightState(t *testing.T, entityID string) light {
	t.Helper()
	resp := request(t, http.MethodGet, "/api/states/"+entityID, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("state of %s: HTTP %d", entityID, resp.StatusCode)
	}
	var s struct {
		State      string `json:"state"`
		Attributes light  `json:"attributes"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&s); err != nil {
		t.Fatal(err)
	}
	return light{State: s.State, Brightness: s.Attributes.Brightness, ColorTempKelvin: s.Attributes.ColorTempKelvin}
}

func request(t *testing.T, method, path string, body []byte) *http.Response {
	t.Helper()
	url, token := os.Getenv("HA_URL"), os.Getenv("HA_TOKEN")
	if len(url) == 0 || len(token) == 0 {
		t.Fatal("HA_URL and HA_TOKEN must be set; run ha/test/run.sh")
	}
	req, err := http.NewRequest(method, url+path, bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	})
	return resp
}
