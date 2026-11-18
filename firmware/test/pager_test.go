package test

import "testing"

func TestPagerLifecycle(t *testing.T) {
	checkAdapter(t, `#include "pager.h"
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
 // A real tap on the settled page remains actionable.
 input.state = LV_INDEV_STATE_PRESSED;
 assert(core.press(233,233)); pager.highlight(core,233,233);
 input.state = LV_INDEV_STATE_RELEASED;
 assert(core.release(233,233) == 0 && core.item().action == "script.second");
 pager.render(core); poll();
 // Tapping while an earlier swipe is settling must not run the old page's action.
 scrolling = true; scroll_x = 300; input.state = LV_INDEV_STATE_PRESSED;
 core.press(233,233); pager.highlight(core,233,233);
 assert(core.release(233,233) == -1);
 // Manifest replacement cancels the contact and resets selection.
 assert(core.accept_json(core.begin_fetch(), manifest, error)); pager.render(core);
 assert(core.page_index() == 0 && scroll_x == 0 && wait_release_count == 1);
 assert(core.release(233,233) == -1);
 input.state = LV_INDEV_STATE_RELEASED; poll(); poll();
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
`, map[string]string{"lvgl.h": countdownLVGLStub + pagerLVGLStub})
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
struct lv_event_t { int code; void *user; };
struct lv_timer_t { void (*callback)(lv_timer_t *); void *user; };
struct lv_draw_buf_t {};
inline std::vector<lv_timer_t *> timers;
inline std::map<lv_obj_t *,std::pair<void (*)(lv_event_t *),void *>> callbacks;
inline bool scrolling=false;
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
inline lv_draw_buf_t *lv_snapshot_take(lv_obj_t *o,int) { ++snapshot_count; snapshot_text.clear(); collect(o); return new lv_draw_buf_t; }
inline int lv_snapshot_take_to_draw_buf(lv_obj_t *o,int,lv_draw_buf_t *) { ++snapshot_count; snapshot_text.clear(); collect(o); return LV_RESULT_OK; }
inline void poll() { for(auto *timer:timers) timer->callback(timer); }
inline void emit(lv_obj_t *o,int code) { auto entry=callbacks.at(o); lv_event_t event{code,entry.second}; entry.first(&event); }
`
