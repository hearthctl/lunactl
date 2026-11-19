package test

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/hearthctl/lunactl/internal/testutil"
)

// Compile the actual success/error automations and render lambda. Assertions
// observe the LVGL status label, including the render after an action error.
func TestProductionManifestStatus(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(testutil.Root(), "esphome/lunactl.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	callbacks := regexp.MustCompile(`(?s)capture_response: true\s+on_success:\s+- lambda: \|-\n(.*?)\n          on_error:\s+- lambda: \|-\n(.*?)\n  - id: render_manifest`).FindStringSubmatch(string(raw))
	render := regexp.MustCompile(`(?s)  - id: render_manifest\n.*?lambda: \|-\n(.*?)\n\n#`).FindStringSubmatch(string(raw))
	label := regexp.MustCompile(`(?s)id: manifest_status\n(.*?)\n    #`).FindStringSubmatch(string(raw))
	if callbacks == nil || render == nil || label == nil {
		t.Fatal("Manifest callback, render or status label missing")
	}
	for _, style := range []string{"align: center", "width: 340", "long_mode: wrap", "text_align: center", "text_font: font_battery"} {
		if !strings.Contains(label[1], style) {
			t.Fatalf("status text must fit the round display: missing %s", style)
		}
	}
	automation := func(block string) string {
		return regexp.MustCompile(`(?m)^\s+- script.execute: (\w+)\s*$`).ReplaceAllString(block, "id($1).execute();")
	}
	checkAdapter(t, `#include "ui.h"
#include <cassert>
#include <functional>
#define id(name) name
#define ESP_LOGW(tag, format, message) (void)message
inline void lv_obj_move_foreground(lv_obj_t *) {}
struct Font { lv_font_t font; const lv_font_t *get_lv_font() const { return &font; } };
struct Script { std::function<void()> fn = []() {}; void execute() { fn(); } };
int main() {
 lunactl::Core manifest_core;
 lunactl::UI page_ui;
 auto touch_surface = lv_obj_create(nullptr);
 auto countdown_ring = lv_arc_create(touch_surface);
 auto manifest_status = lv_label_create(touch_surface);
 auto battery_hint = lv_label_create(touch_surface);
 auto battery_level_text = lv_label_create(touch_surface);
 auto offline_icon = lv_obj_create(touch_surface);
 Font font;
 auto *font_item = &font, *font_icon = &font, *font_battery = &font, *font_countdown = &font, *font_dial = &font;
 Script wake_display, sync_subscriptions, render_manifest;
 render_manifest.fn = [&]() { `+render[1]+` };
 auto success = [&](uint32_t request, JsonObjectConst response) { `+automation(callbacks[1])+` };
 auto failure = [&](uint32_t request, const std::string &error) { `+automation(callbacks[2])+` };
 auto deliver = [&](uint32_t request, const char *json) {
  JsonDocument wire;
  wire["response"]["manifest_json"] = json;
  success(request, wire.as<JsonObjectConst>());
 };
 auto displayed = [&](const char *text) {
  assert(!(manifest_status->flags & LV_OBJ_FLAG_HIDDEN));
  assert(manifest_status->text == text);
  assert(page_ui.root()->flags & LV_OBJ_FLAG_HIDDEN);
 };
 render_manifest.execute();
 displayed("Keine Verbindung");
 manifest_core.set_connected(true);
 auto request = manifest_core.begin_fetch();
 deliver(request, "{}");
 displayed("Kein Manifest\nFür dieses Gerät fehlt es");
 request = manifest_core.begin_fetch();
 failure(request, "Action lunactl.manifest not found");
 displayed("Abruf fehlgeschlagen\nAction lunactl.manifest not found");
 deliver(manifest_core.begin_fetch(), R"({"schema":2,"pages":[]})");
 displayed("Manifest abgelehnt\nUnknown or invalid schema version");
 deliver(manifest_core.begin_fetch(), R"({"schema":1,"extra":true})");
 displayed("Manifest abgelehnt\nInvalid Manifest fields");
 deliver(manifest_core.begin_fetch(), "{oops}");
 displayed("Manifest abgelehnt\nInvalid JSON: InvalidInput");
 failure(request, "Old failure");
 displayed("Manifest abgelehnt\nInvalid JSON: InvalidInput");
 deliver(manifest_core.begin_fetch(), R"({"schema":1,"pages":[{"type":"single","item":{"label":"Working","color":"#123456","action":{"action":"script.working"}}}]})");
 assert(manifest_status->flags & LV_OBJ_FLAG_HIDDEN);
 assert(!(page_ui.root()->flags & LV_OBJ_FLAG_HIDDEN) && manifest_core.tappable());
 failure(manifest_core.begin_fetch(), "Replacement failed");
 assert(manifest_status->flags & LV_OBJ_FLAG_HIDDEN);
 assert(manifest_core.item().label == "Working" && manifest_core.tappable());
}
`, map[string]string{"lvgl.h": countdownLVGLStub})
}
