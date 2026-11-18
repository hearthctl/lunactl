package test

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/hearthctl/lunactl/internal/testutil"
)

// Golden cases exercise the state machine. This test compiles the real UI and
// YAML callbacks, checking that subscriptions and the one-second tick reach LVGL.
func TestProductionCountdown(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(testutil.Root(), "esphome/lunactl.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	extract := func(pattern string) string {
		t.Helper()
		match := regexp.MustCompile(pattern).FindStringSubmatch(string(raw))
		if match == nil {
			t.Fatalf("missing countdown adapter: %s", pattern)
		}
		return match[1]
	}
	tick := extract(`(?s)  - interval: 1s\n    then:\n      - lambda: \|-\n(.*?)\n\nbutton:`)
	sync := extract(`(?s)- id: sync_subscriptions\n.*?- lambda: \|-\n(.*?)\n  - id: wake_display`)
	if !strings.Contains(string(raw), "id: countdown_ring\n        hidden: true\n        adjustable: false") ||
		!strings.Contains(string(raw), "id(font_icon)->get_lv_font(), id(countdown_ring), id(font_battery)->get_lv_font(), id(font_countdown)->get_lv_font())") {
		t.Fatal("the production UI must use the declared inert arc (enables LV_USE_ARC)")
	}
	checkAdapter(t, `#include "ui.h"
#include <functional>
#include <memory>
#define id(name) name
struct StringRef {
 std::string text;
 const char *c_str() const { return text.c_str(); }
 size_t size() const { return text.size(); }
};
struct Client { int drops{0}; void on_fatal_error() { ++drops; } };
struct Server {
 struct Subscription { const char *entity, *attribute; std::function<void(StringRef)> callback; };
 std::vector<Subscription> subscriptions;
 std::vector<std::unique_ptr<Client>> clients;
 void subscribe_home_assistant_state(const char *entity, const char *attribute, std::function<void(StringRef)> &&callback) {
  subscriptions.push_back({entity, attribute, std::move(callback)});
 }
 const auto &active_clients() const { return clients; }
};
namespace api { Server *global_api_server; }
struct { int reboots{0}; void safe_reboot() { ++reboots; } } App;
lunactl::Core manifest_core;
lunactl::UI page_ui;
struct { void execute() { page_ui.render(manifest_core); } } render_manifest;
struct Time {
 struct Now {
  int hour{11}, minute{0};
  int64_t timestamp{1794913200};
  bool valid{false};
  bool is_valid() const { return valid; }
 } current;
 Now now() { return current; }
} ha_time;
bool has_text(lv_obj_t *obj, const std::string &text) {
 if (obj->text == text) return true;
 for (auto child : obj->children) if (has_text(child, text)) return true;
 return false;
}
int main() {
 auto screen = lv_obj_create(nullptr);
 auto ring = lv_obj_create(screen);
 lv_font_t font;
 page_ui.init(screen, &font, &font, ring);
 auto tick = [&]() { `+tick+` };
 auto sync = [&]() { `+sync+` };
 Server server;
 api::global_api_server = &server;
 server.clients.emplace_back(new Client);
 manifest_core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"display":{"brightness":"sensor.brightness"},"pages":[{"type":"single","item":{"label":"Papa rufen","color":"#BB1260","action":{"action":"script.example"},"value":{"format":"{0}","refs":[{"entity":"timer.example","attribute":"duration"}]},"countdown":"timer.example"}},{"type":"pie","quarters":[null,null,null,null]}]})";
 if (!manifest_core.accept_json(manifest_core.begin_fetch(), manifest, error)) return 1;
 render_manifest.execute();
 sync();
 if (server.subscriptions.size() != 4 || server.clients[0]->drops != 1 || App.reboots) return 2;
 auto &duration = server.subscriptions[0];
 auto &state = server.subscriptions[1];
 auto &finish = server.subscriptions[2];
 if (std::string(duration.entity) != "timer.example" || std::string(duration.attribute) != "duration" ||
     state.attribute != nullptr || std::string(finish.attribute) != "finishes_at") return 3;
 // Countdown subscriptions must coexist with the display's brightness reference.
 auto &brightness = server.subscriptions[3];
 if (std::string(brightness.entity) != "sensor.brightness" || brightness.attribute != nullptr) return 19;
 brightness.callback({"40"});
 if (manifest_core.brightness() != 40) return 20;
 state.callback({"active"});
 finish.callback({"2026-11-17T11:01:00+00:00"});
 duration.callback({"0:01:00"});
 tick();
 if (!(ring->flags & LV_OBJ_FLAG_HIDDEN) || has_text(screen, "1:00")) return 4;
 ha_time.current.valid = true;
 tick();
 if (ring->flags & (LV_OBJ_FLAG_HIDDEN | LV_OBJ_FLAG_CLICKABLE) || ring->value != 1000 || !has_text(screen, "1:00")) return 5;
 label_writes = 0;
 tick();
 if (label_writes != 0) return 21;
 if (ring->x != 77 || ring->y != 77 || ring->width != 312 || ring->height != 312) return 6;
 if (!has_text(screen, "Papa rufen") || !has_text(screen, "0:01:00")) return 7;
 ha_time.current.timestamp += 18;
 tick();
 if (ring->value != 700 || !has_text(screen, "42 s") || has_text(screen, "1:00")) return 8;
 // A timer callback restarts the ring without a new Manifest or time sync.
 finish.callback({"2026-11-17T11:01:18Z"});
 if (ring->value != 1000 || !has_text(screen, "1:00")) return 9;
 state.callback({"idle"});
 if (!(ring->flags & LV_OBJ_FLAG_HIDDEN) || has_text(screen, "1:00")) return 10;
 state.callback({"active"});
 if (ring->flags & LV_OBJ_FLAG_HIDDEN) return 11;
 manifest_core.show_page(1);
 render_manifest.execute();
 if (!(ring->flags & LV_OBJ_FLAG_HIDDEN) || has_text(screen, "1:00")) return 12;
 manifest_core.show_page(0);
 render_manifest.execute();
 if (ring->flags & LV_OBJ_FLAG_HIDDEN || !has_text(screen, "1:00")) return 13;
 ha_time.current.timestamp += 60;
 tick();
 if (!(ring->flags & LV_OBJ_FLAG_HIDDEN) || has_text(screen, "1:00")) return 14;
 finish.callback({"2026-11-17T11:02:18Z"});
 if (ring->flags & LV_OBJ_FLAG_HIDDEN) return 15;
 ha_time.current.valid = false;
 tick();
 if (!(ring->flags & LV_OBJ_FLAG_HIDDEN) || has_text(screen, "1:00")) return 16;
 manifest_core.set_connected(false);
 ha_time.current.valid = true;
 tick();
 if (ring->flags & LV_OBJ_FLAG_HIDDEN) return 17; // Disconnected keeps counting down.
 manifest_core.set_connected(true);
 sync();
 if (server.subscriptions.size() != 4 || server.clients[0]->drops != 1 || App.reboots) return 18;
}
`, map[string]string{"lvgl.h": countdownLVGLStub})
}

// Minimal LVGL state for observing actual UI output; firmware compilation checks
// the API signatures against the pinned LVGL library as well.
const countdownLVGLStub = `#pragma once
#include <algorithm>
#include <string>
#include <vector>
struct lv_font_t {};
struct lv_obj_t {
 lv_obj_t *parent{nullptr};
 std::vector<lv_obj_t *> children;
 std::string text, kind{"box"};
 unsigned bg_color{0}, arc_color{0}, indicator_color{0};
 const lv_font_t *font{nullptr};
 int start{0}, size{0}, direction{0}, radius{0}, arc_width{0};
 int flags{3}, value{0}, x{0}, y{0}, width{0}, height{0};
};
constexpr int LV_OBJ_FLAG_CLICKABLE=1, LV_OBJ_FLAG_SCROLLABLE=2, LV_OBJ_FLAG_HIDDEN=4;
constexpr int LV_PART_MAIN=0, LV_PART_INDICATOR=1, LV_OPA_COVER=255, LV_OPA_TRANSP=0;
constexpr int LV_TEXT_ALIGN_CENTER=0, LV_LABEL_LONG_WRAP=0;
inline void lv_obj_set_parent(lv_obj_t *obj, lv_obj_t *parent) {
 if (obj->parent) {
  auto &siblings = obj->parent->children;
  siblings.erase(std::remove(siblings.begin(), siblings.end(), obj), siblings.end());
 }
 obj->parent=parent;
 if (parent) parent->children.push_back(obj);
}
inline lv_obj_t *lv_obj_create(lv_obj_t *parent) {
 auto obj = new lv_obj_t;
 lv_obj_set_parent(obj, parent);
 return obj;
}
inline lv_obj_t *lv_label_create(lv_obj_t *parent) { auto o=lv_obj_create(parent); o->kind="label"; return o; }
inline lv_obj_t *lv_arc_create(lv_obj_t *parent) { auto o=lv_obj_create(parent); o->kind="arc"; return o; }
inline lv_obj_t *lv_arclabel_create(lv_obj_t *parent) { auto o=lv_obj_create(parent); o->kind="arclabel"; return o; }
constexpr int LV_ARCLABEL_DIR_CLOCKWISE=0, LV_ARCLABEL_DIR_COUNTER_CLOCKWISE=1;
constexpr int LV_ARCLABEL_TEXT_ALIGN_CENTER=2, LV_ARCLABEL_OVERFLOW_ELLIPSIS=1;
inline void lv_arclabel_set_text(lv_obj_t *o, const char *s) { o->text=s; }
inline void lv_arclabel_set_angle_start(lv_obj_t *o, int v) { o->start=v; }
inline void lv_arclabel_set_angle_size(lv_obj_t *o, int v) { o->size=v; }
inline void lv_arclabel_set_radius(lv_obj_t *o, int v) { o->radius=v; }
inline void lv_arclabel_set_dir(lv_obj_t *o, int v) { o->direction=v; }
inline void lv_obj_set_style_bg_color(lv_obj_t *o, unsigned c, int) { o->bg_color=c; }
inline void lv_obj_set_style_arc_color(lv_obj_t *o, unsigned c, int part) { if (part==LV_PART_MAIN) o->arc_color=c; else o->indicator_color=c; }
inline void lv_obj_set_style_arc_width(lv_obj_t *o, int v, int part) { if (part==LV_PART_MAIN) o->arc_width=v; }
inline void lv_obj_set_style_text_font(lv_obj_t *o, const lv_font_t *f, int) { o->font=f; }
inline void lv_arc_set_bg_angles(lv_obj_t *o, int start, int end) { o->start=start; o->size=end-start; }
inline void lv_obj_remove_flag(lv_obj_t *o, int f) { o->flags &= ~f; }
inline void lv_obj_add_flag(lv_obj_t *o, int f) { o->flags |= f; }
inline void lv_obj_set_pos(lv_obj_t *o, int x, int y) { o->x=x; o->y=y; }
inline void lv_obj_set_size(lv_obj_t *o, int w, int h) { o->width=w; o->height=h; }
inline void lv_obj_set_width(lv_obj_t *o, int w) { o->width=w; }
inline void lv_obj_set_x(lv_obj_t *o, int x) { o->x=x; }
inline int label_writes = 0;
inline const char *lv_label_get_text(lv_obj_t *o) { return o->text.c_str(); }
inline void lv_label_set_text(lv_obj_t *o, const char *s) { ++label_writes; o->text=s; }
inline void lv_arc_set_value(lv_obj_t *o, int v) { o->value=v; }
inline unsigned lv_obj_get_style_arc_color(lv_obj_t *o, int part) { return part==LV_PART_MAIN ? o->arc_color : o->indicator_color; }
inline bool lv_color_eq(unsigned a, unsigned b) { return a==b; }
inline unsigned lv_color_hex(unsigned color) { return color; }
inline unsigned lv_color_mix(unsigned a, unsigned, int) { return a; }
#define LV_NOOP(name) template<typename... Args> inline void name(Args...) {}
LV_NOOP(lv_obj_remove_style_all)
LV_NOOP(lv_obj_set_style_clip_corner)
LV_NOOP(lv_obj_set_style_bg_opa)
LV_NOOP(lv_obj_set_style_radius)
LV_NOOP(lv_obj_set_style_text_color)
LV_NOOP(lv_obj_set_style_text_align)
LV_NOOP(lv_label_set_long_mode)
LV_NOOP(lv_arc_set_rotation)
LV_NOOP(lv_arc_set_range)
LV_NOOP(lv_obj_set_style_arc_opa)
LV_NOOP(lv_obj_set_style_arc_rounded)
LV_NOOP(lv_arclabel_set_text_horizontal_align)
LV_NOOP(lv_arclabel_set_text_vertical_align)
LV_NOOP(lv_arclabel_set_overflow)
#undef LV_NOOP
`
