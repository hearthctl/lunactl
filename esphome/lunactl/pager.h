#pragma once
#include "ui.h"

namespace lunactl {

// LVGL owns motion; Core owns the selected page and whether a contact may act.
class Pager {
 public:
  void init(lv_obj_t *surface, const lv_font_t *text, const lv_font_t *icons, lv_obj_t *,
            const lv_font_t *clock, const lv_font_t *countdown) {
    if (surface_) return;
    surface_ = surface;
    text_ = text; icons_ = icons; clock_ = clock; countdown_ = countdown;
    lv_obj_remove_style_all(surface_);
    lv_obj_set_size(surface_, 466, 466);
    lv_obj_center(surface_);
    lv_obj_add_flag(surface_, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(surface_, LV_OBJ_FLAG_SCROLL_ONE);
    lv_obj_set_scroll_dir(surface_, LV_DIR_HOR);
    lv_obj_set_scrollbar_mode(surface_, LV_SCROLLBAR_MODE_OFF);
    lv_obj_set_scroll_snap_x(surface_, LV_SCROLL_SNAP_CENTER);
    lv_obj_add_event_cb(surface_, [](lv_event_t *e) {
      auto *self = static_cast<Pager *>(lv_event_get_user_data(e));
      if (!self->core_) return;
      if (lv_event_get_code(e) == LV_EVENT_PRESSING) {
        lv_point_t point;
        lv_indev_get_point(lv_indev_active(), &point);
        if (!self->core_->move(point.x, point.y)) self->clear_feedback();
      } else if (lv_event_get_code(e) == LV_EVENT_SCROLL_BEGIN && self->contact_) {
        self->core_->cancel_press();
        self->clear_feedback();
        bool cached = self->cache_ready();
        self->set_live_clip(!cached);
        self->set_cached(cached);
      }
    }, LV_EVENT_ALL, this);
    lv_timer_create([](lv_timer_t *timer) {
      static_cast<Pager *>(lv_timer_get_user_data(timer))->poll();
    }, 20, this);
  }

  void render(Core &core) {
    core_ = &core;
    if (!surface_) return;
    if (revision_ != core.revision()) {
      if (contact_) {
        feedback_pending_ = false;
        core.cancel_touch();
        lv_indev_reset(nullptr, surface_);
        for (auto *input = lv_indev_get_next(nullptr); input; input = lv_indev_get_next(input))
          if (lv_indev_get_type(input) == LV_INDEV_TYPE_POINTER) lv_indev_wait_release(input);
        contact_ = false;
      }
      set_cached(false);
      lv_obj_stop_scroll_anim(surface_);
      revision_ = core.revision();
      lv_obj_scroll_to_x(surface_, core.page_index() * 466, LV_ANIM_OFF);
    }
    pending_ = true;
    if (contact_ || lv_obj_is_scrolling(surface_)) return;
    paint();
  }

  void update_time(Core &core) { render(core); }

  // Called by the existing press adapter after Core has consumed a wake touch.
  void highlight(const Core &core, int x, int y) {
    if (!surface_) return;
    bool active = x >= 0 && y >= 0 && core.tappable();
    bool unsettled = lv_obj_is_scrolling(surface_) ||
        lv_obj_get_scroll_x(surface_) != static_cast<int>(core.page_index() * 466);
    if (unsettled && core_) core_->cancel_press();
    contact_ = true;
    lv_obj_set_scroll_dir(surface_, active ? LV_DIR_HOR : LV_DIR_NONE);
    feedback_pending_ = active && !unsettled && core.page_index() < count_;
    feedback_x_ = x; feedback_y_ = y; feedback_since_ = lv_tick_get();
  }

 private:
  struct Page {
    UI ui;
    lv_obj_t *container{nullptr}, *image{nullptr};
    lv_draw_buf_t *snapshot{nullptr};
    std::vector<std::string> content;
    bool dirty{false}, valid{false}, highlighted{false};
  } pages_[6];
  lv_obj_t *surface_{nullptr};
  Core *core_{nullptr};
  const lv_font_t *text_{nullptr}, *icons_{nullptr}, *clock_{nullptr}, *countdown_{nullptr};
  size_t count_{0};
  uint32_t revision_{0};
  bool contact_{false}, cached_{false}, pending_{false}, feedback_pending_{false};
  int feedback_x_{0}, feedback_y_{0};
  uint32_t feedback_since_{0};

  static bool pressed() {
    for (auto *input = lv_indev_get_next(nullptr); input; input = lv_indev_get_next(input))
      if (lv_indev_get_type(input) == LV_INDEV_TYPE_POINTER &&
          lv_indev_get_state(input) == LV_INDEV_STATE_PRESSED) return true;
    return false;
  }
  bool cache_ready() const {
    for (size_t i = 0; i < count_; ++i)
      if (!pages_[i].valid || pages_[i].dirty) return false;
    return count_ > 0;
  }
  void clear_feedback() {
    feedback_pending_ = false;
    for (size_t i = 0; i < count_; ++i) {
      auto &page = pages_[i];
      if (!page.highlighted) continue;
      Core view = *core_;
      view.show_page(i);
      page.ui.render(view);
      page.highlighted = false;
      if (cached_) lv_obj_add_flag(page.ui.root(), LV_OBJ_FLAG_HIDDEN);
    }
  }
  void set_live_clip(bool value) {
    for (size_t i = 0; i < count_; ++i)
      lv_obj_set_style_clip_corner(pages_[i].ui.root(), value, 0);
  }
  void set_cached(bool value) {
    if (value == cached_) return;
    cached_ = value;
    for (size_t i = 0; i < count_; ++i) {
      auto &page = pages_[i];
      if (value) {
        lv_obj_add_flag(page.ui.root(), LV_OBJ_FLAG_HIDDEN);
        lv_obj_remove_flag(page.image, LV_OBJ_FLAG_HIDDEN);
      } else {
        lv_obj_remove_flag(page.ui.root(), LV_OBJ_FLAG_HIDDEN);
        lv_obj_add_flag(page.image, LV_OBJ_FLAG_HIDDEN);
      }
    }
  }
  // Only visible content invalidates a snapshot, not an unrelated HA update.
  static std::vector<std::string> content(const Core &view) {
    std::vector<std::string> result{std::to_string(view.page_count()),
      view.pie() ? "pie" : "single", view.center() ? "center" : "", view.pie() ? view.clock() : ""};
    for (size_t slot = 0; slot < (view.pie() ? 5u : 1u); ++slot) {
      const auto &item = view.item(slot);
      result.push_back(view.slot_tappable(slot) ? "filled" : "empty");
      result.push_back(item.label); result.push_back(item.icon);
      result.push_back(std::to_string(item.rgb)); result.push_back(view.value(slot));
    }
    auto timer = view.countdown();
    result.push_back(timer.text); result.push_back(std::to_string(timer.ring));
    result.push_back(std::to_string(timer.remaining));
    return result;
  }
  void paint() {
    set_cached(false);
    set_live_clip(false);
    pending_ = false;
    count_ = core_->tappable() ? core_->page_count() : 0;
    Core view = *core_;
    for (size_t i = 0; i < 6; ++i) {
      auto &page = pages_[i];
      if (i >= count_) {
        if (page.container) lv_obj_add_flag(page.container, LV_OBJ_FLAG_HIDDEN);
        if (page.snapshot) {
          lv_obj_set_style_bg_image_src(page.image, nullptr, 0);
          lv_draw_buf_destroy(page.snapshot);
          page.snapshot = nullptr;
        }
        page.valid = page.dirty = page.highlighted = false;
        page.content.clear();
        continue;
      }
      if (!page.container) {
        page.container = lv_obj_create(surface_);
        lv_obj_remove_style_all(page.container);
        lv_obj_set_size(page.container, 466, 466);
        lv_obj_set_pos(page.container, i * 466, 0);
        lv_obj_remove_flag(page.container, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_remove_flag(page.container, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_add_flag(page.container, LV_OBJ_FLAG_SNAPPABLE);
        page.ui.init(page.container, text_, icons_, lv_arc_create(page.container), clock_, countdown_);
        page.image = lv_obj_create(page.container);
        lv_obj_remove_style_all(page.image);
        lv_obj_set_size(page.image, 466, 466);
        lv_obj_remove_flag(page.image, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_remove_flag(page.image, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_add_flag(page.image, LV_OBJ_FLAG_HIDDEN);
      }
      lv_obj_remove_flag(page.container, LV_OBJ_FLAG_HIDDEN);
      view.show_page(i);
      auto next = content(view);
      bool changed = next != page.content;
      if (changed) {
        page.content = std::move(next);
        page.dirty = true;
        page.valid = false;
      }
      // Also removes a press highlight without capturing it in the cache.
      if (changed || page.highlighted) page.ui.render(view);
      page.highlighted = false;
    }
    lv_obj_update_layout(surface_);
    lv_obj_scroll_to_x(surface_, core_->page_index() * 466, LV_ANIM_OFF);
  }
  void poll() {
    if (!core_) return;
    if (contact_) {
      if (feedback_pending_ && pressed() && !lv_obj_is_scrolling(surface_) &&
          lv_tick_get() - feedback_since_ >= 120) {
        pages_[core_->page_index()].ui.highlight(*core_, feedback_x_, feedback_y_);
        pages_[core_->page_index()].highlighted = true;
        feedback_pending_ = false;
      }
      if (pressed() || lv_obj_is_scrolling(surface_)) return;
      feedback_pending_ = false;
      int x = lv_obj_get_scroll_x(surface_);
      if (count_ > 0 && (x < 0 || x % 466 != 0 || x / 466 >= static_cast<int>(count_))) return;
      contact_ = false;
      core_->cancel_touch();
      set_cached(false);
      if (count_ && core_->page_index() != static_cast<size_t>(x / 466)) core_->show_page(x / 466);
      revision_ = core_->revision();
      lv_obj_set_scroll_dir(surface_, LV_DIR_HOR);
      pending_ = true;
    }
    if (pending_) paint();
    if (pressed() || lv_obj_is_scrolling(surface_)) return;
    // At most one snapshot per idle turn; never draw snapshots during a gesture.
    for (size_t i = 0; i < count_; ++i) {
      auto &page = pages_[i];
      if (!page.dirty) continue;
      page.dirty = false;
      // Clip children to the root's circular radius only while building the image.
      // Live rendering keeps the hardware-mask fast path; scrolling reuses the result.
      lv_obj_set_style_clip_corner(page.ui.root(), true, 0);
      if (!page.snapshot) page.snapshot = lv_snapshot_take(page.ui.root(), LV_COLOR_FORMAT_RGB565);
      else if (lv_snapshot_take_to_draw_buf(page.ui.root(), LV_COLOR_FORMAT_RGB565, page.snapshot) != LV_RESULT_OK) {
        lv_obj_set_style_bg_image_src(page.image, nullptr, 0);
        lv_draw_buf_destroy(page.snapshot);
        page.snapshot = nullptr;
      }
      lv_obj_set_style_clip_corner(page.ui.root(), false, 0);
      page.valid = page.snapshot != nullptr;
      if (page.valid) lv_obj_set_style_bg_image_src(page.image, page.snapshot, 0);
      // Allocation failure keeps live scrolling usable; a content update retries.
      return;
    }
  }
};
}  // namespace lunactl
