package test

import (
	"strings"
	"testing"
)

func TestPager(t *testing.T) {
	for _, tc := range []struct{ name, source string }{
		{name: "deferred values and reversal", source: `#include "pager.h"
#include <cassert>
int main() {
 auto *surface = lv_obj_create(nullptr);
 lv_font_t font;
 lunactl::Core core;
 lunactl::Pager pager;
 pager.init(surface, &font, &font, nullptr, &font, &font);
 core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"pages":[{"type":"single","item":{"label":"First","color":"#123456","action":{"action":"script.first"},"value":{"format":"{0}","refs":[{"entity":"sensor.value"}]}}},{"type":"single","item":{"label":"Second","color":"#654321","action":{"action":"script.second"}}}]})";
 assert(core.accept_json(core.begin_fetch(), manifest, error));
 core.set_state({"sensor.value", ""}, "before");
 pager.render(core);
 poll(); poll();
 assert(snapshot_count == 2);
 assert(!(surface->children[0]->children[0]->flags & (1 << 20)));
 // Unchanged updates do not repeatedly render snapshots.
 pager.update_time(core); poll();
 assert(snapshot_count == 2);
 // The finger goes away and back. Neither scrolling nor reversal may act.
 input.state = LV_INDEV_STATE_PRESSED;
 assert(core.press(233,233)); pager.highlight(core,233,233);
 input.point = {100,233}; emit(surface, LV_EVENT_PRESSING);
 emit(surface, LV_EVENT_SCROLL_BEGIN);
 assert(surface->children[0]->children[0]->flags & LV_OBJ_FLAG_HIDDEN);
 scrolling = true; scroll_x = 240;
 core.set_state({"sensor.value", ""}, "after"); pager.render(core); poll();
 assert(snapshot_count == 2 && core.page_index() == 0);
 input.point = {233,233}; emit(surface, LV_EVENT_PRESSING);
 assert(core.release(233,233) == -1);
 input.state = LV_INDEV_STATE_RELEASED;
 scroll_x = 300; scrolling = false; poll();
 assert(core.page_index() == 0); // Intermediate SCROLL_END is not a page selection.
 scroll_x = 466; poll(); poll();
 assert(core.page_index() == 1 && snapshot_count == 3);
 assert(!(surface->children[1]->children[0]->flags & LV_OBJ_FLAG_HIDDEN));
 assert(snapshot_text.find("after") != std::string::npos);

}
`},
		{name: "tap feedback restores clean color", source: `#include "pager.h"
#include <cassert>
int main() {
 auto *surface = lv_obj_create(nullptr);
 lv_font_t font;
 lunactl::Core core;
 lunactl::Pager pager;
 pager.init(surface, &font, &font, nullptr, &font, &font);
 core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"pages":[{"type":"single","item":{"label":"First","color":"#123456","action":{"action":"script.first"},"value":{"format":"{0}","refs":[{"entity":"sensor.value"}]}}},{"type":"single","item":{"label":"Second","color":"#654321","action":{"action":"script.second"}}}]})";
 assert(core.accept_json(core.begin_fetch(), manifest, error));
 core.set_state({"sensor.value", ""}, "before");
 pager.render(core);
 poll(); poll();
 assert(snapshot_count == 2);
 assert(!(surface->children[0]->children[0]->flags & (1 << 20)));
 core.show_page(1); pager.render(core);
 // A real tap on the settled page remains actionable.
 input.state = LV_INDEV_STATE_PRESSED;
 assert(core.press(233,233)); pager.highlight(core,233,233);
 tick_now += 120; poll();
 auto *item = surface->children[1]->children[0]->children[0];
 assert(item->bg_color != 0x654321); // Upstream press feedback survives Pager routing.
 input.state = LV_INDEV_STATE_RELEASED;
 assert(core.release(233,233) == 0 && core.item().action == "script.second");
 pager.render(core); poll();
 assert(item->bg_color == 0x654321 && snapshot_count == 2);
 // The press color is restored without replacing the clean cached image.

}
`},
		{name: "manifest replaces an interrupted gesture", source: `#include "pager.h"
#include <cassert>
int main() {
 auto *surface = lv_obj_create(nullptr);
 lv_font_t font;
 lunactl::Core core;
 lunactl::Pager pager;
 pager.init(surface, &font, &font, nullptr, &font, &font);
 core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"pages":[{"type":"single","item":{"label":"First","color":"#123456","action":{"action":"script.first"},"value":{"format":"{0}","refs":[{"entity":"sensor.value"}]}}},{"type":"single","item":{"label":"Second","color":"#654321","action":{"action":"script.second"}}}]})";
 assert(core.accept_json(core.begin_fetch(), manifest, error));
 core.set_state({"sensor.value", ""}, "before");
 pager.render(core);
 poll(); poll();
 assert(snapshot_count == 2);
 assert(!(surface->children[0]->children[0]->flags & (1 << 20)));
 // Tapping while an earlier swipe is settling must not run the old page's action.
 scrolling = true; scroll_x = 300; input.state = LV_INDEV_STATE_PRESSED;
 core.press(233,233); pager.highlight(core,233,233);
 assert(core.release(233,233) == -1);
 // Manifest replacement cancels the contact and resets selection.
 assert(core.accept_json(core.begin_fetch(), manifest, error)); pager.render(core);
 assert(core.page_index() == 0 && scroll_x == 0 && wait_release_count == 1);
 assert(core.release(233,233) == -1);
 input.state = LV_INDEV_STATE_RELEASED; poll(); poll();

}
`},
		{name: "disconnect reconnect and wake", source: `#include "pager.h"
#include <cassert>
int main() {
 auto *surface = lv_obj_create(nullptr);
 lv_font_t font;
 lunactl::Core core;
 lunactl::Pager pager;
 pager.init(surface, &font, &font, nullptr, &font, &font);
 core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"pages":[{"type":"single","item":{"label":"First","color":"#123456","action":{"action":"script.first"},"value":{"format":"{0}","refs":[{"entity":"sensor.value"}]}}},{"type":"single","item":{"label":"Second","color":"#654321","action":{"action":"script.second"}}}]})";
 assert(core.accept_json(core.begin_fetch(), manifest, error));
 core.set_state({"sensor.value", ""}, "before");
 pager.render(core);
 poll(); poll();
 assert(snapshot_count == 2);
 assert(!(surface->children[0]->children[0]->flags & (1 << 20)));
 // Disconnect during a gesture removes pages and invalidates actions/caches.
 input.state = LV_INDEV_STATE_PRESSED;
 core.press(233,233); pager.highlight(core,233,233);
 core.set_connected(false); pager.render(core);
 assert(core.release(233,233) == -1 && destroyed >= 2);
 input.state = LV_INDEV_STATE_RELEASED; poll();
 // Reconnect reconstructs cache, and a dark-screen touch only wakes.
 core.set_connected(true); pager.render(core); poll(); poll();
 core.sleep(); pager.render(core);
 input.state = LV_INDEV_STATE_PRESSED;
 bool active = core.press(233,233);
 pager.highlight(core, active ? 233 : -1, active ? 233 : -1);
 assert(!active && scroll_dir == LV_DIR_NONE);
 input.state = LV_INDEV_STATE_RELEASED;
 assert(core.release(233,233) == -1); pager.render(core); poll();
 assert(scroll_dir == LV_DIR_HOR);
}
`},
		{name: "swipe then sleep restores departure color", source: `#include "pager.h"
#include <cassert>
int main() {
 auto *surface = lv_obj_create(nullptr);
 lv_font_t font;
 lunactl::Core core;
 lunactl::Pager pager;
 pager.init(surface, &font, &font, nullptr, &font, &font);
 core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"pages":[{"type":"single","item":{"label":"First","color":"#123456","action":{"action":"script.first"},"value":{"format":"{0}","refs":[{"entity":"sensor.value"}]}}},{"type":"single","item":{"label":"Second","color":"#654321","action":{"action":"script.second"}}}]})";
 assert(core.accept_json(core.begin_fetch(), manifest, error));
 core.set_state({"sensor.value", ""}, "before");
 pager.render(core);
 poll(); poll();
 assert(snapshot_count == 2);
 assert(!(surface->children[0]->children[0]->flags & (1 << 20)));

 input.state = LV_INDEV_STATE_PRESSED;
 assert(core.press(233,233)); pager.highlight(core,233,233);
 tick_now += 120; poll();
 auto *home_item = surface->children[0]->children[0]->children[0];
 assert(home_item->bg_color != 0x123456);
 emit(surface, LV_EVENT_SCROLL_BEGIN);
 scrolling = true; scroll_x = 240;
 assert(core.release(100,233) == -1);
 input.state = LV_INDEV_STATE_RELEASED;
 scrolling = false; scroll_x = 466; poll();
 assert(core.page_index() == 1);
 assert(home_item->bg_color == 0x123456);
 core.sleep(); pager.render(core);
 input.state = LV_INDEV_STATE_PRESSED;
 bool active = core.press(233,233);
 assert(!active); pager.highlight(core,-1,-1);
 assert(home_item->bg_color == 0x123456);
 input.state = LV_INDEV_STATE_RELEASED;
 assert(core.release(233,233) == -1); pager.render(core); poll();
 assert(home_item->bg_color == 0x123456 && snapshot_count == 2);

}
`},
		{name: "round live fallback with missing snapshots", source: `#include "pager.h"
#include <cassert>
int main() {
 auto *surface = lv_obj_create(nullptr);
 lv_font_t font;
 lunactl::Core core;
 lunactl::Pager pager;
 pager.init(surface, &font, &font, nullptr, &font, &font);
 core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"pages":[{"type":"single","item":{"label":"First","color":"#123456","action":{"action":"script.first"},"value":{"format":"{0}","refs":[{"entity":"sensor.value"}]}}},{"type":"single","item":{"label":"Second","color":"#654321","action":{"action":"script.second"}}}]})";
 assert(core.accept_json(core.begin_fetch(), manifest, error));
 core.set_state({"sensor.value", ""}, "before");
 pager.render(core);

 auto *home = surface->children[0]->children[0];
 auto *second = surface->children[1]->children[0];
 input.state = LV_INDEV_STATE_PRESSED;
 core.press(233,233); pager.highlight(core,233,233);
 emit(surface, LV_EVENT_SCROLL_BEGIN);
 assert(!(home->flags & LV_OBJ_FLAG_HIDDEN));
 assert(home->flags & (1 << 20));
 assert(second->flags & (1 << 20));
 scrolling = true; scroll_x = 240;
 assert(core.release(100,233) == -1);
 input.state = LV_INDEV_STATE_RELEASED;
 scrolling = false; scroll_x = 466; poll();
 assert(core.page_index() == 1);
 assert(!(home->flags & (1 << 20)) && !(second->flags & (1 << 20)));

}
`},
		{name: "round live fallback with dirty snapshot", source: `#include "pager.h"
#include <cassert>
int main() {
 auto *surface = lv_obj_create(nullptr);
 lv_font_t font;
 lunactl::Core core;
 lunactl::Pager pager;
 pager.init(surface, &font, &font, nullptr, &font, &font);
 core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"pages":[{"type":"single","item":{"label":"First","color":"#123456","action":{"action":"script.first"},"value":{"format":"{0}","refs":[{"entity":"sensor.value"}]}}},{"type":"single","item":{"label":"Second","color":"#654321","action":{"action":"script.second"}}}]})";
 assert(core.accept_json(core.begin_fetch(), manifest, error));
 core.set_state({"sensor.value", ""}, "before");
 pager.render(core);
 poll(); poll();
 core.set_state({"sensor.value", ""}, "changed"); pager.render(core);
 auto *home = surface->children[0]->children[0];
 auto *second = surface->children[1]->children[0];
 input.state = LV_INDEV_STATE_PRESSED;
 core.press(233,233); pager.highlight(core,233,233);
 emit(surface, LV_EVENT_SCROLL_BEGIN);
 assert(!(home->flags & LV_OBJ_FLAG_HIDDEN));
 assert(home->flags & (1 << 20));
 assert(second->flags & (1 << 20));
 scrolling = true; scroll_x = 240;
 assert(core.release(100,233) == -1);
 input.state = LV_INDEV_STATE_RELEASED;
 scrolling = false; scroll_x = 466; poll();
 assert(core.page_index() == 1);
 assert(!(home->flags & (1 << 20)) && !(second->flags & (1 << 20)));

}
`},
		{name: "round live fallback with allocation failure", source: `#include "pager.h"
#include <cassert>
int main() {
 auto *surface = lv_obj_create(nullptr);
 lv_font_t font;
 lunactl::Core core;
 lunactl::Pager pager;
 pager.init(surface, &font, &font, nullptr, &font, &font);
 core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"pages":[{"type":"single","item":{"label":"First","color":"#123456","action":{"action":"script.first"},"value":{"format":"{0}","refs":[{"entity":"sensor.value"}]}}},{"type":"single","item":{"label":"Second","color":"#654321","action":{"action":"script.second"}}}]})";
 assert(core.accept_json(core.begin_fetch(), manifest, error));
 core.set_state({"sensor.value", ""}, "before");
 pager.render(core);
 snapshot_fail = true; poll(); poll();
 auto *home = surface->children[0]->children[0];
 auto *second = surface->children[1]->children[0];
 input.state = LV_INDEV_STATE_PRESSED;
 core.press(233,233); pager.highlight(core,233,233);
 emit(surface, LV_EVENT_SCROLL_BEGIN);
 assert(!(home->flags & LV_OBJ_FLAG_HIDDEN));
 assert(home->flags & (1 << 20));
 assert(second->flags & (1 << 20));
 scrolling = true; scroll_x = 240;
 assert(core.release(100,233) == -1);
 input.state = LV_INDEV_STATE_RELEASED;
 scrolling = false; scroll_x = 466; poll();
 assert(core.page_index() == 1);
 assert(!(home->flags & (1 << 20)) && !(second->flags & (1 << 20)));

}
`},
		{name: "manifest cancels rounded live fallback", source: `#include "pager.h"
#include <cassert>
int main() {
 auto *surface = lv_obj_create(nullptr);
 lv_font_t font;
 lunactl::Core core;
 lunactl::Pager pager;
 pager.init(surface, &font, &font, nullptr, &font, &font);
 core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"pages":[{"type":"single","item":{"label":"First","color":"#123456","action":{"action":"script.first"},"value":{"format":"{0}","refs":[{"entity":"sensor.value"}]}}},{"type":"single","item":{"label":"Second","color":"#654321","action":{"action":"script.second"}}}]})";
 assert(core.accept_json(core.begin_fetch(), manifest, error));
 core.set_state({"sensor.value", ""}, "before");
 pager.render(core);

 auto *home = surface->children[0]->children[0];
 input.state = LV_INDEV_STATE_PRESSED;
 core.press(233,233); pager.highlight(core,233,233);
 emit(surface, LV_EVENT_SCROLL_BEGIN);
 assert(home->flags & (1 << 20));
 scrolling = true; scroll_x = 240;
 assert(core.accept_json(core.begin_fetch(),manifest,error)); pager.render(core);
 assert(scroll_x == 0 && !scrolling && wait_release_count == 1);
 assert(!(home->flags & (1 << 20)));
 assert(core.release(233,233) == -1);

}
`},
		{name: "swipe before feedback delay", source: `#include "pager.h"
#include <cassert>
int main() {
 auto *surface = lv_obj_create(nullptr);
 lv_font_t font;
 lunactl::Core core;
 lunactl::Pager pager;
 pager.init(surface, &font, &font, nullptr, &font, &font);
 core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"pages":[{"type":"single","item":{"label":"First","color":"#123456","action":{"action":"script.first"},"value":{"format":"{0}","refs":[{"entity":"sensor.value"}]}}},{"type":"single","item":{"label":"Second","color":"#654321","action":{"action":"script.second"}}}]})";
 assert(core.accept_json(core.begin_fetch(), manifest, error));
 core.set_state({"sensor.value", ""}, "before");
 pager.render(core);
 poll(); poll();
 assert(snapshot_count == 2);
 assert(!(surface->children[0]->children[0]->flags & (1 << 20)));

 auto *item = surface->children[0]->children[0]->children[0];
 input.state = LV_INDEV_STATE_PRESSED;
 core.press(233,233); pager.highlight(core,233,233);
 tick_now = 60; poll(); assert(item->bg_color == 0x123456);
 emit(surface, LV_EVENT_SCROLL_BEGIN);
 tick_now = 200; poll(); assert(item->bg_color == 0x123456);
 assert(core.release(233,233) == -1);

}
`},
		{name: "held feedback removed on live swipe", source: `#include "pager.h"
#include <cassert>
int main() {
 auto *surface = lv_obj_create(nullptr);
 lv_font_t font;
 lunactl::Core core;
 lunactl::Pager pager;
 pager.init(surface, &font, &font, nullptr, &font, &font);
 core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"pages":[{"type":"single","item":{"label":"First","color":"#123456","action":{"action":"script.first"},"value":{"format":"{0}","refs":[{"entity":"sensor.value"}]}}},{"type":"single","item":{"label":"Second","color":"#654321","action":{"action":"script.second"}}}]})";
 assert(core.accept_json(core.begin_fetch(), manifest, error));
 core.set_state({"sensor.value", ""}, "before");
 pager.render(core);
 poll(); poll();
 assert(snapshot_count == 2);
 assert(!(surface->children[0]->children[0]->flags & (1 << 20)));

 core.set_state({"sensor.value", ""}, "dirty"); pager.render(core);
 auto *root = surface->children[0]->children[0];
 auto *item = root->children[0];
 input.state = LV_INDEV_STATE_PRESSED;
 core.press(233,233); pager.highlight(core,233,233);
 tick_now = 120; poll(); assert(item->bg_color != 0x123456);
 emit(surface, LV_EVENT_SCROLL_BEGIN);
 assert(!(root->flags & LV_OBJ_FLAG_HIDDEN));
 assert(item->bg_color == 0x123456);
 tick_now = 500; poll(); assert(item->bg_color == 0x123456);
 assert(core.release(233,233) == -1);

}
`},
		{name: "vertical movement cancels feedback permanently", source: `#include "pager.h"
#include <cassert>
int main() {
 auto *surface = lv_obj_create(nullptr);
 lv_font_t font;
 lunactl::Core core;
 lunactl::Pager pager;
 pager.init(surface, &font, &font, nullptr, &font, &font);
 core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"pages":[{"type":"single","item":{"label":"First","color":"#123456","action":{"action":"script.first"},"value":{"format":"{0}","refs":[{"entity":"sensor.value"}]}}},{"type":"single","item":{"label":"Second","color":"#654321","action":{"action":"script.second"}}}]})";
 assert(core.accept_json(core.begin_fetch(), manifest, error));
 core.set_state({"sensor.value", ""}, "before");
 pager.render(core);
 poll(); poll();
 assert(snapshot_count == 2);
 assert(!(surface->children[0]->children[0]->flags & (1 << 20)));

 auto *item = surface->children[0]->children[0]->children[0];
 input.state = LV_INDEV_STATE_PRESSED;
 core.press(233,233); pager.highlight(core,233,233);
 tick_now = 120; poll(); assert(item->bg_color != 0x123456);
 input.point = {233,280}; emit(surface, LV_EVENT_PRESSING);
 assert(item->bg_color == 0x123456);
 input.point = {233,233}; emit(surface, LV_EVENT_PRESSING);
 tick_now = 500; poll(); assert(item->bg_color == 0x123456);
 assert(core.release(233,233) == -1);

}
`},
		{name: "short tap acts without delayed flash", source: `#include "pager.h"
#include <cassert>
int main() {
 auto *surface = lv_obj_create(nullptr);
 lv_font_t font;
 lunactl::Core core;
 lunactl::Pager pager;
 pager.init(surface, &font, &font, nullptr, &font, &font);
 core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"pages":[{"type":"single","item":{"label":"First","color":"#123456","action":{"action":"script.first"},"value":{"format":"{0}","refs":[{"entity":"sensor.value"}]}}},{"type":"single","item":{"label":"Second","color":"#654321","action":{"action":"script.second"}}}]})";
 assert(core.accept_json(core.begin_fetch(), manifest, error));
 core.set_state({"sensor.value", ""}, "before");
 pager.render(core);
 poll(); poll();
 assert(snapshot_count == 2);
 assert(!(surface->children[0]->children[0]->flags & (1 << 20)));

 auto *item = surface->children[0]->children[0]->children[0];
 input.state = LV_INDEV_STATE_PRESSED;
 core.press(233,233); pager.highlight(core,233,233);
 tick_now = 50; input.state = LV_INDEV_STATE_RELEASED;
 assert(core.release(233,233) == 0);
 pager.render(core); poll(); tick_now = 200; poll();
 assert(item->bg_color == 0x123456);

}
`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			checkAdapter(t, tc.source, map[string]string{"lvgl.h": strings.Replace(countdownLVGLStub, "LV_NOOP(lv_obj_set_style_clip_corner)", `inline void lv_obj_set_style_clip_corner(lv_obj_t *o, bool clip, int) { if (clip) o->flags |= 1 << 20; else o->flags &= ~(1 << 20); }`, 1) + pagerLVGLStub})
		})
	}
}

const pagerLVGLStub = `
#include <cassert>
#include <map>
constexpr int LV_OBJ_FLAG_SCROLL_ONE=8, LV_OBJ_FLAG_SNAPPABLE=16;
constexpr int LV_DIR_HOR=1, LV_DIR_NONE=0, LV_SCROLLBAR_MODE_OFF=0, LV_SCROLL_SNAP_CENTER=0;
constexpr int LV_ANIM_OFF=0, LV_EVENT_ALL=0, LV_EVENT_PRESSING=1, LV_EVENT_SCROLL_BEGIN=2;
constexpr int LV_INDEV_TYPE_POINTER=0, LV_INDEV_STATE_PRESSED=1, LV_INDEV_STATE_RELEASED=0;
constexpr int LV_COLOR_FORMAT_RGB565=0, LV_RESULT_OK=0;
struct lv_point_t { int x{0},y{0}; };
struct lv_indev_t { int state{0}; lv_point_t point; };
inline lv_indev_t input;
inline uint32_t tick_now=0;
inline uint32_t lv_tick_get() { return tick_now; }
struct lv_event_t { int code; void *user; };
struct lv_timer_t { void (*callback)(lv_timer_t *); void *user; };
struct lv_draw_buf_t {};
inline std::vector<lv_timer_t *> timers;
inline std::map<lv_obj_t *,std::pair<void (*)(lv_event_t *),void *>> callbacks;
inline bool scrolling=false, snapshot_fail=false;
inline int scroll_x=0,scroll_dir=0,snapshot_count=0,destroyed=0,wait_release_count=0;
inline std::string snapshot_text;
inline void lv_obj_center(lv_obj_t *) {}
inline void lv_obj_set_scroll_dir(lv_obj_t *,int dir) { scroll_dir=dir; }
inline void lv_obj_set_scrollbar_mode(lv_obj_t *,int) {}
inline void lv_obj_set_scroll_snap_x(lv_obj_t *,int) {}
inline void lv_obj_add_event_cb(lv_obj_t *o,void (*cb)(lv_event_t *),int,void *user) { callbacks[o]={cb,user}; }
inline void *lv_event_get_user_data(lv_event_t *e) { return e->user; }
inline int lv_event_get_code(lv_event_t *e) { return e->code; }
inline lv_indev_t *lv_indev_active() { return &input; }
inline void lv_indev_get_point(lv_indev_t *i,lv_point_t *p) { *p=i->point; }
inline lv_indev_t *lv_indev_get_next(lv_indev_t *i) { return i ? nullptr : &input; }
inline int lv_indev_get_type(lv_indev_t *) { return LV_INDEV_TYPE_POINTER; }
inline int lv_indev_get_state(lv_indev_t *i) { return i->state; }
inline void lv_indev_reset(lv_indev_t *,lv_obj_t *) {}
inline void lv_indev_wait_release(lv_indev_t *) { ++wait_release_count; }
inline void lv_timer_create(void (*cb)(lv_timer_t *),int,void *user) { timers.push_back(new lv_timer_t{cb,user}); }
inline void *lv_timer_get_user_data(lv_timer_t *t) { return t->user; }
inline bool lv_obj_is_scrolling(lv_obj_t *) { return scrolling; }
inline void lv_obj_stop_scroll_anim(lv_obj_t *) { scrolling=false; }
inline void lv_obj_scroll_to_x(lv_obj_t *,int x,int) { scroll_x=x; }
inline int lv_obj_get_scroll_x(lv_obj_t *) { return scroll_x; }
inline void lv_obj_update_layout(lv_obj_t *) {}
inline void lv_obj_set_style_bg_image_src(lv_obj_t *,const void *,int) {}
inline void lv_draw_buf_destroy(lv_draw_buf_t *p) { ++destroyed; delete p; }
inline void collect(lv_obj_t *o) { snapshot_text+=o->text; for(auto *child:o->children) collect(child); }
inline lv_draw_buf_t *lv_snapshot_take(lv_obj_t *o,int) { assert(o->flags & (1 << 20)); ++snapshot_count; snapshot_text.clear(); collect(o); return snapshot_fail ? nullptr : new lv_draw_buf_t; }
inline int lv_snapshot_take_to_draw_buf(lv_obj_t *o,int,lv_draw_buf_t *) { assert(o->flags & (1 << 20)); ++snapshot_count; snapshot_text.clear(); collect(o); return snapshot_fail ? 1 : LV_RESULT_OK; }
inline void poll() { for(auto *timer:timers) timer->callback(timer); }
inline void emit(lv_obj_t *o,int code) { auto entry=callbacks.at(o); lv_event_t event{code,entry.second}; entry.first(&event); }
`
