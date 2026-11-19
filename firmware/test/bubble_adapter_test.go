package test

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"

	"github.com/hearthctl/lunactl/internal/testutil"
)

// Compile the production lambda that applies Core's key hold bubble to LVGL.
func TestProductionHoldBubbleAdapter(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(testutil.Root(), "esphome/lunactl.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	match := regexp.MustCompile(`(?s)  - id: update_hold_bubble\n.*?lambda: \|-\n(.*?)\n  - id:`).FindStringSubmatch(string(raw))
	if match == nil {
		t.Fatal("missing update_hold_bubble script")
	}
	if !regexp.MustCompile(`(?s)interval: 10ms.*?script.execute: update_hold_bubble\n\s+- script.execute: update_display`).Match(raw) ||
		!regexp.MustCompile(`(?s)id: hold_bubble\n(?:        [^\n]+\n)*?        hidden: true\n(?:        [^\n]+\n)*?        clickable: false`).Match(raw) {
		t.Fatal("the bubble must be polled every 10 ms and declared hidden and inert")
	}
	checkAdapter(t, `#include "core.h"
#define id(name) name
uint32_t now = 0;
uint32_t millis() { return now; }
constexpr uint32_t LV_OBJ_FLAG_HIDDEN = 1;
struct lv_obj_t { uint32_t flags{LV_OBJ_FLAG_HIDDEN}; int x{0}, y{0}, width{0}, height{0}, opa{-1}; uint32_t bg{0}, border{0}; int writes{0}; } bubble_object;
lv_obj_t *hold_bubble = &bubble_object;
uint32_t lv_color_hex(uint32_t rgb) { return rgb; }
void lv_obj_add_flag(lv_obj_t *o, uint32_t f) { o->flags |= f; ++o->writes; }
void lv_obj_remove_flag(lv_obj_t *o, uint32_t f) { o->flags &= ~f; ++o->writes; }
void lv_obj_set_style_bg_color(lv_obj_t *o, uint32_t c, int) { o->bg = c; ++o->writes; }
void lv_obj_set_style_border_color(lv_obj_t *o, uint32_t c, int) { o->border = c; ++o->writes; }
void lv_obj_set_style_opa(lv_obj_t *o, int v, int) { o->opa = v; ++o->writes; }
void lv_obj_set_size(lv_obj_t *o, int w, int h) { o->width = w; o->height = h; ++o->writes; }
void lv_obj_set_pos(lv_obj_t *o, int x, int y) { o->x = x; o->y = y; ++o->writes; }
lunactl::Core manifest_core;
void update() { `+match[1]+` }
int main() {
 manifest_core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"pages":[{"type":"single","item":{"label":"Keys","color":"#123456","action":{"action":"script.item"}}}],"buttons":{"a_long":{"action":"script.a_long"},"b_short":{"action":"script.b_short"}}})";
 if (!manifest_core.accept_json(manifest_core.begin_fetch(), manifest, error)) return 1;
 now = 100; manifest_core.button(lunactl::Key::A, true, now);
 // Held 399 ms: a short press shows nothing and touches nothing.
 now = 499; update();
 if (!(bubble_object.flags & LV_OBJ_FLAG_HIDDEN) || bubble_object.writes != 0) return 2;
 now = 500; update();
 if ((bubble_object.flags & LV_OBJ_FLAG_HIDDEN) || bubble_object.width != 40 || bubble_object.height != 40 ||
     bubble_object.x != 213 || bubble_object.y != 213 || bubble_object.opa != 192 ||
     bubble_object.bg != 0xFFC107 || bubble_object.border != 0xFFC107) return 3;
 // An unchanged bubble is not written again, so LVGL does not redraw it.
 int writes = bubble_object.writes;
 now = 501; update();
 if (bubble_object.writes != writes) return 4;
 now = 1800; update();
 if (bubble_object.width != 140 || bubble_object.x != 163 || bubble_object.y != 163) return 5;
 // The long gesture fires and the bubble pops: bigger and fading.
 now = 3100; manifest_core.button(lunactl::Key::A, true, now); update();
 if (bubble_object.width != 240 || bubble_object.opa != 192) return 6;
 now = 3225; update();
 if (bubble_object.width != 280 || bubble_object.x != 93 || bubble_object.opa != 96) return 7;
 now = 3350; update();
 if (!(bubble_object.flags & LV_OBJ_FLAG_HIDDEN)) return 8;
 // Taste B has no long gesture: holding it shows nothing.
 manifest_core.button(lunactl::Key::A, false, 3400);
 now = 4000; manifest_core.button(lunactl::Key::B, true, now);
 now = 5000; update();
 if (!(bubble_object.flags & LV_OBJ_FLAG_HIDDEN)) return 9;
}
`)
}
