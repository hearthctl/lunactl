package test

import (
	"strings"
	"testing"

	"github.com/hearthctl/lunactl/internal/testutil"
)

func TestManifestFailureReasons(t *testing.T) {
	for _, tc := range []struct {
		name, raw, want string
	}{
		{"empty response", `{}`, "Kein Manifest\nFür dieses Gerät fehlt es"},
		{"invalid fields", `{"schema":1,"extra":true}`, "Manifest abgelehnt\nInvalid Manifest fields"},
		{"unsupported schema", `{"schema":2,"pages":[]}`, "Manifest abgelehnt\nUnknown or invalid schema version"},
		{"invalid JSON", `{oops}`, "Manifest abgelehnt\nInvalid JSON: InvalidInput"},
		{"JSON too deep", strings.Repeat(`{"n":`, 32) + `{}` + strings.Repeat(`}`, 32), "Manifest abgelehnt\nInvalid JSON: TooDeep"},
		{"too large", `{}` + strings.Repeat(" ", 32767), "Manifest abgelehnt\nManifest exceeds 32 KiB"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := testutil.Host(t, []map[string]any{
				{"type": "connect"}, {"type": "fetch"}, {"type": "manifest", "raw": tc.raw}, {"type": "tap"},
			})["snapshots"].([]any)
			for _, snapshot := range got[2:] {
				last := snapshot.(map[string]any)
				if last["status"] != tc.want || last["tappable"] != false || last["call"] != nil {
					t.Fatalf("failure display = %v, want %q and no actions", last, tc.want)
				}
			}
		})
	}
}

func TestManifestFetchFailures(t *testing.T) {
	for _, reason := range []string{"Action lunactl.manifest not found", "Actions not allowed", ""} {
		got := testutil.Host(t, []map[string]any{
			{"type": "connect"}, {"type": "fetch"}, {"type": "error", "error": reason}, {"type": "tap"},
		})["snapshots"].([]any)
		if reason == "" {
			reason = "Unbekannter Fehler"
		}
		for _, value := range got[2:] {
			snapshot := value.(map[string]any)
			if snapshot["status"] != "Abruf fehlgeschlagen\n"+reason || snapshot["call"] != nil {
				t.Fatalf("fetch failure: %v", snapshot)
			}
		}
	}
}

func TestManifestFailureLifecycle(t *testing.T) {
	checkAdapter(t, `#include "core.h"
#include <cassert>
int main() {
 lunactl::Core core;
 core.set_connected(true);
 std::string error;
 uint32_t old = core.begin_fetch(), request = core.begin_fetch();
 assert(!core.accept_json(request, "{}", error));
 std::string missing = core.status();
 assert(!core.fetch_failed(old, "Old error"));
 assert(!core.accept_json(old, "{", error));
 assert(!core.accept_json(old, std::string(32769, ' '), error));
 JsonDocument invalid;
 assert(!core.accept(old, invalid.as<JsonVariantConst>(), error));
 assert(core.status() == missing);
 core.set_connected(false);
 assert(std::string(core.status()) == "Keine Verbindung");
 assert(!core.fetch_failed(request, "Disconnected error"));
 core.set_connected(true);
 assert(std::string(core.status()) == "Kein Manifest");
 assert(!core.accept_json(request, "{}", error));
 assert(std::string(core.status()) == "Kein Manifest");
 const char *valid = R"({"schema":1,"buttons":{"a_short":{"action":"script.key"}},"pages":[{"type":"single","item":{"label":"Home","color":"#123456","action":{"action":"script.home"},"value":{"format":"{0}","refs":[{"entity":"sensor.value"}]}}},{"type":"single","item":{"label":"Second","color":"#654321","action":{"action":"script.second"}}}]})";
 request = core.begin_fetch();
 assert(core.accept_json(request, valid, error));
 assert(std::string(core.status()).empty() && core.tappable());
 core.set_state({"sensor.value", ""}, "kept");
 core.show_page(1);
 auto revision = core.revision();
 for (const char *bad : {"{}", "{", "{\"schema\":2}"}) {
  assert(!core.accept_json(core.begin_fetch(), bad, error));
  assert(std::string(core.status()).empty() && core.tappable());
  assert(core.page_index() == 1 && core.item().label == "Second" && core.revision() == revision);
 }
 assert(core.fetch_failed(core.begin_fetch(), "Failed replacement"));
 core.begin_fetch();
 core.tick(lunactl::MANIFEST_FETCH_TIMEOUT_MS);
 assert(core.page_index() == 1 && core.item().label == "Second" && core.tappable());
 assert(std::string(core.status()).empty());
 core.show_page(0);
 assert(core.value() == "kept" && core.subscriptions().size() == 1);
 assert(core.button(lunactl::Key::A, true, 10001).action.action.empty());
 assert(core.button(lunactl::Key::A, false, 10002).action.action == "script.key");
 assert(core.accept_json(core.begin_fetch(), valid, error));
 assert(core.page_index() == 0 && std::string(core.status()).empty());
}
`)
}

func TestManifestFetchTimeout(t *testing.T) {
	checkAdapter(t, `#include "core.h"
#include <cassert>
int main() {
 for (uint32_t start : {0u, UINT32_MAX - 5000}) {
  lunactl::Core core;
  core.wake(start);
  core.set_connected(true);
  auto old = core.begin_fetch();
  core.tick(start + 5000);
  auto request = core.begin_fetch();
  core.tick(start + 10000);
  assert(std::string(core.status()) == "Kein Manifest"); // Only the latest fetch times out.
  assert(core.tick(start + 15000));
  assert(std::string(core.status()) == "Abruf fehlgeschlagen\nKeine Antwort von HA (Aktionen erlaubt?)");
  assert(!core.tick(start + 15001)); // Timeout renders once, even while asleep.
  assert(!core.fetch_failed(old, "Old failure"));
  std::string error;
  assert(!core.accept_json(request, "{}", error));
  assert(std::string(core.status()) == "Kein Manifest\nFür dieses Gerät fehlt es");
  core.begin_fetch();
  core.set_connected(false);
  core.tick(start + 25000);
  assert(std::string(core.status()) == "Keine Verbindung");
 }
}
`)
}

func TestManifestFailureTextFits(t *testing.T) {
	// Put a multibyte glyph across the 96-byte cutoff; no partial UTF-8 reaches LVGL.
	reason := strings.Repeat("x", 95) + "ü" + strings.Repeat("x", 100)
	got := testutil.Host(t, []map[string]any{
		{"type": "connect"}, {"type": "fetch"}, {"type": "error", "error": reason},
	})["snapshots"].([]any)[2].(map[string]any)
	if want := "Abruf fehlgeschlagen\n" + strings.Repeat("x", 95) + "..."; got["status"] != want {
		t.Fatalf("bounded reason: %v, want %q", got, want)
	}
	got = testutil.Host(t, []map[string]any{
		{"type": "connect"}, {"type": "fetch"}, {"type": "error", "error": "line\nwith\tcontrols\x00"},
	})["snapshots"].([]any)[2].(map[string]any)
	if got["status"] != "Abruf fehlgeschlagen\nline with controls " {
		t.Fatalf("single-line reason: %v", got)
	}
}
