package test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/hearthctl/lunactl/internal/testutil"
)

func request(t *testing.T, method, path string, body any) (int, []byte) {
	t.Helper()
	url, token := os.Getenv("HA_URL"), os.Getenv("HA_TOKEN")
	if url == "" || token == "" {
		t.Fatal("run make check-contracts (disposable Home Assistant required)")
	}
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequest(method, url+path, bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	client := http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, err = io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return resp.StatusCode, raw
}

func call(t *testing.T, action string, data any, response bool) map[string]any {
	t.Helper()
	path := "/api/services/" + strings.Replace(action, ".", "/", 1)
	if response {
		path += "?return_response"
	}
	status, raw := request(t, http.MethodPost, path, data)
	if status != http.StatusOK {
		t.Fatalf("%s: HTTP %d: %s", action, status, raw)
	}
	if !response {
		return nil
	}
	var envelope map[string]any
	if err := json.Unmarshal(raw, &envelope); err != nil {
		t.Fatal(err)
	}
	return envelope["service_response"].(map[string]any)
}

func state(t *testing.T, entity string) string {
	t.Helper()
	status, raw := request(t, http.MethodGet, "/api/states/"+entity, nil)
	if status != http.StatusOK {
		t.Fatalf("state: HTTP %d: %s", status, raw)
	}
	var result struct{ State string }
	if err := json.Unmarshal(raw, &result); err != nil {
		t.Fatal(err)
	}
	return result.State
}

func run(t *testing.T, action string, payload any) {
	t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	call(t, "script.lunactl_run", map[string]any{"action": action, "data": string(raw)}, false)
}

func TestManifestToTap(t *testing.T) {
	call(t, "input_boolean.turn_off", map[string]any{"entity_id": "input_boolean.lunactl_example"}, false)
	manifest := call(t, "script.lunactl_manifest", map[string]any{"mac": "aa:bb:cc:dd:ee:ff"}, true)
	got := testutil.Host(t, []map[string]any{{"type": "connect"}, {"type": "fetch"}, {"type": "manifest", "manifest": manifest}, {"type": "tap"}})
	last := got["snapshots"].([]any)[3].(map[string]any)
	if last["tappable"] != true || last["item"].(map[string]any)["label"] != "Beispiel" || last["item"].(map[string]any)["color"] != "#B91360" {
		t.Fatalf("reference Manifest rejected or rendered incorrectly: %v", got)
	}
	invocation := last["call"].(map[string]any)
	call(t, invocation["service"].(string), map[string]any{"action": invocation["action"], "data": invocation["data"]}, false)
	if got := state(t, "input_boolean.lunactl_example"); got != "on" {
		t.Fatalf("tap did not run action: %s", got)
	}
}

func TestManifestToButtonGestures(t *testing.T) {
	for _, gesture := range []string{"a_short", "a_long", "b_short", "b_long"} {
		t.Run(gesture, func(t *testing.T) {
			call(t, "input_boolean.turn_off", map[string]any{"entity_id": "input_boolean.lunactl_example"}, false)
			manifest := call(t, "script.lunactl_manifest", map[string]any{"mac": "aa:bb:cc:dd:ee:ff"}, true)
			manifest["buttons"] = map[string]any{gesture: map[string]any{
				"action": "input_boolean.toggle", "target": map[string]any{"entity_id": "input_boolean.lunactl_example"},
			}}
			events := []map[string]any{
				{"type": "connect"}, {"type": "fetch"}, {"type": "manifest", "manifest": manifest},
				{"type": "sleep"}, {"type": "button", "key": gesture[:1], "pressed": true, "now": 0},
			}
			duration := 999
			if strings.HasSuffix(gesture, "_long") {
				duration = 1001
				events = append(events, map[string]any{"type": "button", "key": gesture[:1], "pressed": true, "now": 1000})
			}
			events = append(events, map[string]any{"type": "button", "key": gesture[:1], "pressed": false, "now": duration})
			got := testutil.Host(t, events)
			snapshots := got["snapshots"].([]any)
			press := snapshots[4].(map[string]any)
			if press["display_on"] != true || press["wake"] != true || press["call"] != nil {
				t.Fatalf("press must wake before dispatching: %v", press)
			}
			calls := 0
			for _, value := range snapshots {
				if invocation, ok := value.(map[string]any)["call"].(map[string]any); ok {
					calls++
					call(t, invocation["service"].(string), map[string]any{"action": invocation["action"], "data": invocation["data"]}, false)
				}
			}
			if calls != 1 || state(t, "input_boolean.lunactl_example") != "on" {
				t.Fatalf("gesture must run its action exactly once: %v", got)
			}
		})
	}
}

func TestUnknownMAC(t *testing.T) {
	manifest := call(t, "script.lunactl_manifest", map[string]any{"mac": "00:00:00:00:00:00"}, true)
	if len(manifest) != 0 {
		t.Fatalf("unknown device received Manifest: %v", manifest)
	}
	got := testutil.Host(t, []map[string]any{{"type": "connect"}, {"type": "fetch"}, {"type": "manifest", "manifest": manifest}})
	last := got["snapshots"].([]any)[2].(map[string]any)
	if last["status"] != "Kein Manifest" || last["tappable"] != false {
		t.Fatal(last)
	}
}

func TestRunTargetAndData(t *testing.T) {
	for _, target := range []any{"input_text.contract_result", []string{"input_text.contract_result"}} {
		value := "Grüße \"quoted\" \\ path\nsecond line"
		run(t, "input_text.set_value", map[string]any{"target": map[string]any{"entity_id": target}, "data": map[string]any{"value": value}})
		if got := state(t, "input_text.contract_result"); got != value {
			t.Fatalf("target/data roundtrip: %q", got)
		}
	}
}

func TestRunNestedDataAndNoTarget(t *testing.T) {
	payload := map[string]any{"enabled": true, "values": []any{1.0, 2.5, nil}, "text": "Gemütlich"}
	run(t, "script.contract_echo", map[string]any{"data": map[string]any{"payload": payload}, "target": map[string]any{}})
	var got any
	if err := json.Unmarshal([]byte(state(t, "input_text.contract_result")), &got); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, payload) {
		t.Fatalf("nested data changed: %v", got)
	}
}

func TestRunNoData(t *testing.T) {
	call(t, "input_boolean.turn_off", map[string]any{"entity_id": "input_boolean.lunactl_example"}, false)
	run(t, "script.contract_no_data", map[string]any{"target": map[string]any{}, "data": map[string]any{}})
	if got := state(t, "input_boolean.lunactl_example"); got != "on" {
		t.Fatal(got)
	}
}

func TestRunErrors(t *testing.T) {
	for _, tc := range []struct{ name, action, data string }{
		{"invalid JSON", "input_boolean.turn_on", "{"},
		{"unknown action", "lunactl_missing.action", "{}"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			call(t, "input_boolean.turn_off", map[string]any{"entity_id": "input_boolean.lunactl_example"}, false)
			status, _ := request(t, http.MethodPost, "/api/services/script/lunactl_run", map[string]any{"action": tc.action, "data": tc.data})
			if status < 400 {
				t.Fatalf("bad action reported success: HTTP %d", status)
			}
			if got := state(t, "input_boolean.lunactl_example"); got != "off" {
				t.Fatal("failed action changed state:", got)
			}
		})
	}
}
