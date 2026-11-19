package test

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"

	"github.com/hearthctl/lunactl/internal/testutil"
)

func TestProductionDisplayAdapter(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(testutil.Root(), "esphome/lunactl.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	extract := func(pattern string) string {
		t.Helper()
		match := regexp.MustCompile(pattern).FindStringSubmatch(string(raw))
		if match == nil {
			t.Fatalf("missing display adapter: %s", pattern)
		}
		return match[1]
	}
	wake := extract(`(?s)  - id: wake_display\n.*?lambda: \|-\n(.*?)\n  - id:`)
	update := extract(`(?s)  - id: update_display\n.*?lambda: \|-\n(.*?)\n  - id:`)
	touch := regexp.MustCompile(`(?s)        on_press:\n          - lambda: \|-\n(.*?)\n        on_release:\n          - lambda: \|-\n(.*?)\n          - script.execute: render_manifest`).FindStringSubmatch(string(raw))
	if touch == nil {
		t.Fatal("missing touch callbacks")
	}
	if !regexp.MustCompile(`(?s)interval: 10ms.*?script.execute: update_display\n\n  - interval: 1s`).Match(raw) ||
		!regexp.MustCompile(`(?s)  - id: render_manifest\n.*?id\(wake_display\).execute\(\);`).Match(raw) ||
		!regexp.MustCompile(`(?s)  - id: render_manifest\n.*?if \(core.offline_icon\(\)\) lv_obj_remove_flag\(id\(offline_icon\), LV_OBJ_FLAG_HIDDEN\);\n\s+else lv_obj_add_flag\(id\(offline_icon\), LV_OBJ_FLAG_HIDDEN\);`).Match(raw) ||
		!regexp.MustCompile(`(?s)model: CO5300\n    brightness: 179`).Match(raw) {
		t.Fatal("display polling, render brightness sync, offline icon or initial 70% missing")
	}
	checkAdapter(t, `#include "core.h"
#define id(name) name
uint32_t now = 0;
uint32_t millis() { return now; }
lunactl::Core manifest_core;
struct { int brightness{-1}, calls{0}; void set_brightness(int value) { brightness = value; ++calls; } } amoled;
struct { bool paused{false}; int refreshes{0}; void set_paused(bool value, bool) { paused = value; ++refreshes; } } manifest_ui;
struct { int slot{-1}; void highlight(const lunactl::Core &core, int x, int y) { slot = core.hit(x, y); } } page_ui;
struct Wake { void execute() { `+wake+` } } wake_display;
struct { int calls{0}; void execute() { ++calls; wake_display.execute(); } } render_manifest;
int tapped_slot = -1;
struct Point { int x, y; };
int main() {
 auto update = [&]() { `+update+` };
 auto press = [&](Point point) { `+touch[1]+` };
 auto release = [&](Point point) { `+touch[2]+` };
 update();
 if (amoled.brightness != 179 || amoled.calls != 1) return 1;
 now = 9999; update();
 if (!manifest_core.display_on() || amoled.calls != 1 || manifest_ui.refreshes != 1) return 2;
 now = 10000; update();
 if (manifest_core.display_on() || amoled.brightness != 0 || render_manifest.calls != 1) return 3;
 now = 10001; press({233,233}); release({233,233});
 if (!manifest_core.display_on() || amoled.brightness != 179 || tapped_slot != -1) return 4;
 manifest_core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"display":{"timeout":2,"brightness":"sensor.brightness"},"pages":[{"type":"single","item":{"label":"Home","color":"#123456","action":{"action":"script.home"}}},{"type":"pie","quarters":[null,null,null,null]}]})";
 if (!manifest_core.accept_json(manifest_core.begin_fetch(), manifest, error)) return 5;
 if (manifest_core.subscriptions().size() != 1 || manifest_core.subscriptions()[0].entity != "sensor.brightness") return 6;
 manifest_core.set_state({"sensor.brightness", ""}, "40");
 render_manifest.execute();
 if (amoled.brightness != 102) return 7;
 manifest_core.show_page(1);
 now = 12001; update();
 if (manifest_core.page_index() != 1 || amoled.brightness != 0) return 8;
 manifest_core.set_state({"sensor.brightness", ""}, "20");
 render_manifest.execute();
 if (amoled.brightness != 0) return 9; // Live updates must not wake the display.
 now = 12002; press({233,233});
 if (page_ui.slot != -1 || amoled.brightness != 51) return 10;
 release({233,233});
 if (tapped_slot != -1 || manifest_core.page_index() != 1) return 11; // Waking keeps the last page.
 manifest_core.show_page(0);
 now = 12003; press({233,233}); release({233,233});
 if (page_ui.slot != 0 || tapped_slot != 0) return 12;
 manifest_core.set_state({"sensor.brightness", ""}, "unavailable");
 render_manifest.execute();
 if (amoled.brightness != 179) return 13;
 manifest_core.set_state({"sensor.brightness", ""}, "80");
 render_manifest.execute();
 if (amoled.brightness != 204) return 14;
 manifest_core.set_connected(false);
 render_manifest.execute();
 if (amoled.brightness != 204) return 15; // Disconnected keeps the last brightness.
 now = 14003; update();
 now = 14004; press({233,233}); release({233,233});
 if (tapped_slot != -1 || amoled.brightness != 204 || manifest_ui.paused) return 16;
 // Disconnected: a tap never runs an Item; it flashes the offline icon,
 // and polling renders when that icon appears or expires.
 now = 14005; press({233,233}); release({233,233});
 if (tapped_slot != -1 || !manifest_core.offline_icon()) return 18;
 now = 17005; update();
 int renders = render_manifest.calls;
 if (manifest_core.offline_icon()) return 19;
 now = 12003 + lunactl::OFFLINE_STALE_MS - 1; update();
 if (manifest_core.offline_icon() || render_manifest.calls != renders) return 20;
 now = 12003 + lunactl::OFFLINE_STALE_MS; update();
 if (!manifest_core.offline_icon() || render_manifest.calls != renders + 1) return 21;
}
`)
}
