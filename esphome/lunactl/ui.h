#pragma once

#include "core.h"
#include "lvgl.h"
#include <cstring>

namespace lunactl {

// Allocated once. The core owns page selection, hit testing and action selection.
class UI {
 public:
  void init(lv_obj_t *parent, const lv_font_t *text, const lv_font_t *icons, lv_obj_t *countdown_ring,
            const lv_font_t *clock_font = nullptr, const lv_font_t *countdown_font = nullptr) {
    if (root_) return;
    text_font_ = text;
    clock_font_ = clock_font ? clock_font : text;
    root_ = box(parent, 0, 0, 466, 466, 0x000000, 233);
    // The round panel masks the corners without an LVGL clipping layer.
    single_ = box(root_, 93, 93, 280, 280, 0, 140);
    single_icon_ = label(single_, icons, 0, 45, 280);
    single_label_ = label(single_, text, 20, 120, 240);
    single_value_ = label(single_, text, 20, 174, 240);
    single_countdown_ = label(single_, text, 20, 214, 240);
    center_ = box(root_, 93, 93, 280, 280, 0, 140);
    center_label_ = label(center_, text, 20, 56, 240);
    center_countdown_ = label(center_, countdown_font ? countdown_font : text, 20, 105, 240);
    center_value_ = label(center_, text, 20, 174, 240);
    ring_ = countdown_ring;
    lv_obj_set_parent(ring_, root_);
    lv_obj_remove_style_all(ring_);
    lv_obj_remove_flag(ring_, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(ring_, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_pos(ring_, 77, 77);
    lv_obj_set_size(ring_, 312, 312);
    lv_arc_set_rotation(ring_, 270);
    lv_arc_set_bg_angles(ring_, 0, 360);
    lv_arc_set_range(ring_, 0, 1000);
    for (auto part : {LV_PART_MAIN, LV_PART_INDICATOR}) {
      lv_obj_set_style_arc_width(ring_, 8, part);
      lv_obj_set_style_arc_opa(ring_, LV_OPA_COVER, part);
      lv_obj_set_style_arc_rounded(ring_, true, part);
    }
    for (int slot = 0; slot < 4; ++slot) {
      int x = slot == 1 || slot == 2 ? 236 : 0;
      int y = slot >= 2 ? 236 : 0;
      quarters_[slot] = box(root_, x, y, 230, 230, 0x202020, 0);
      // Place text toward the middle of each quarter, inside the round edge.
      int cx = x == 0 ? 134 : 98;
      int cy = y == 0 ? 134 : 98;
      quarter_icons_[slot] = label(quarters_[slot], icons, cx - 80, cy - 54, 160);
      quarter_labels_[slot] = label(quarters_[slot], text, cx - 80, cy + 4, 160);
      quarter_values_[slot] = label(quarters_[slot], text, cx - 80, cy + 38, 160);
      // Clip each full-circle arc to its quadrant, including invalidation.
      int arc_x = slot == 1 || slot == 2 ? 233 : 0;
      int arc_y = slot >= 2 ? 233 : 0;
      auto *clip = box(root_, arc_x, arc_y, 233, 233, 0, 0);
      lv_obj_set_style_bg_opa(clip, LV_OPA_TRANSP, 0);
      auto *arc = quarter_arcs_[slot] = lv_arc_create(clip);
      lv_obj_remove_style_all(arc);
      lv_obj_remove_flag(arc, LV_OBJ_FLAG_CLICKABLE);
      lv_obj_remove_flag(arc, LV_OBJ_FLAG_SCROLLABLE);
      lv_obj_set_pos(arc, -arc_x, -arc_y);
      lv_obj_set_size(arc, 466, 466);
      lv_arc_set_rotation(arc, 0);
      lv_obj_set_style_arc_opa(arc, LV_OPA_TRANSP, LV_PART_INDICATOR);
      lv_arc_set_bg_angles(arc, QUARTER_ANGLES[slot] - CENTER_QUARTER_ANGLE / 2,
                          QUARTER_ANGLES[slot] + CENTER_QUARTER_ANGLE / 2);
      lv_obj_set_style_arc_width(arc, 233 - CENTER_HOLE_RADIUS, LV_PART_MAIN);
      lv_obj_set_style_arc_opa(arc, LV_OPA_COVER, LV_PART_MAIN);
      lv_obj_set_style_arc_rounded(arc, false, LV_PART_MAIN);
      auto *curved = curved_labels_[slot] = lv_arclabel_create(root_);
      lv_obj_remove_style_all(curved);
      lv_obj_remove_flag(curved, LV_OBJ_FLAG_CLICKABLE);
      lv_obj_remove_flag(curved, LV_OBJ_FLAG_SCROLLABLE);
      lv_obj_set_pos(curved, 0, 0);
      lv_obj_set_size(curved, 466, 466);
      lv_obj_set_style_text_font(curved, text, 0);
      lv_obj_set_style_text_color(curved, lv_color_hex(0xFFFFFF), 0);
      lv_arclabel_set_radius(curved, 200);
      lv_arclabel_set_angle_start(curved, QUARTER_ANGLES[slot] - CENTER_QUARTER_ANGLE / 2);
      lv_arclabel_set_angle_size(curved, CENTER_QUARTER_ANGLE);
      lv_arclabel_set_dir(curved, slot < 2 ? LV_ARCLABEL_DIR_CLOCKWISE : LV_ARCLABEL_DIR_COUNTER_CLOCKWISE);
      lv_arclabel_set_text_horizontal_align(curved, LV_ARCLABEL_TEXT_ALIGN_CENTER);
      lv_arclabel_set_text_vertical_align(curved, LV_ARCLABEL_TEXT_ALIGN_CENTER);
      lv_arclabel_set_overflow(curved, LV_ARCLABEL_OVERFLOW_ELLIPSIS);
      lv_arclabel_set_text(curved, "");
    }
    hole_ = box(root_, 177, 177, 112, 112, 0x000000, 56);
    clock_ = label(root_, text, 177, 215, 112);
    dots_ = box(root_, 0, 437, 1, 28, 0x000000, 14);
    for (int i = 0; i < 6; ++i) dots[i] = box(dots_, 11 + i * 18, 9, 10, 10, 0x666666, 5);
  }

  lv_obj_t *root() const { return root_; }

  void render(const Core &core) {
    visible(root_, core.tappable());
    if (!core.tappable()) return;
    visible(single_, !core.pie());
    visible(center_, core.center());
    visible(hole_, core.pie() && !core.center());
    visible(clock_, core.pie());
    lv_obj_set_pos(clock_, core.center() ? 201 : 177, core.center() ? 3 : 215);
    lv_obj_set_width(clock_, core.center() ? 64 : 112);
    lv_obj_set_style_text_font(clock_, core.center() ? clock_font_ : text_font_, 0);
    if (core.center()) {
      const auto &item = core.item(CENTER_SLOT);
      lv_obj_set_style_bg_color(center_, lv_color_hex(item.rgb), 0);
      lv_label_set_text(center_label_, item.label.c_str());
      lv_label_set_text(center_value_, core.value(CENTER_SLOT).c_str());
    }
    if (!core.pie()) {
      paint(single_, single_label_, single_icon_, core.item());
      lv_label_set_text(single_value_, core.value().c_str());
    }
    for (size_t slot = 0; slot < 4; ++slot) {
      visible(quarters_[slot], core.pie() && !core.center());
      visible(quarter_arcs_[slot], core.center());
      visible(curved_labels_[slot], core.center());
      if (core.center()) {
        bool filled = core.slot_tappable(slot);
        lv_obj_set_style_arc_color(quarter_arcs_[slot], lv_color_hex(filled ? core.item(slot).rgb : 0x202020), LV_PART_MAIN);
        lv_arclabel_set_text(curved_labels_[slot], filled ? core.item(slot).label.c_str() : "");
        continue;
      }
      if (!core.pie()) continue;
      lv_label_set_text(quarter_values_[slot], core.value(slot).c_str());
      if (core.slot_tappable(slot)) paint(quarters_[slot], quarter_labels_[slot], quarter_icons_[slot], core.item(slot));
      else {
        lv_obj_set_style_bg_color(quarters_[slot], lv_color_hex(0x202020), 0);
        lv_label_set_text(quarter_labels_[slot], "");
        lv_label_set_text(quarter_icons_[slot], "");
      }
    }
    update_time(core);
    visible(dots_, core.page_count() > 1);
    lv_obj_set_x(dots_, core.dots_left());
    lv_obj_set_width(dots_, core.dots_width());
    for (size_t i = 0; i < 6; ++i) {
      visible(dots[i], i < core.page_count());
      lv_obj_set_style_bg_color(dots[i], lv_color_hex(i == core.page_index() ? 0xFFFFFF : 0x666666), 0);
    }
  }

  void highlight(const Core &core, int x, int y) {
    int slot = core.hit(x, y);
    if (slot < 0 || !root_) return;
    auto rgb = core.item(slot).rgb;
    unsigned brightness = (299 * ((rgb >> 16) & 255) + 587 * ((rgb >> 8) & 255) + 114 * (rgb & 255)) / 1000;
    auto color = lv_color_mix(lv_color_hex(brightness >= 128 ? 0x000000 : 0xFFFFFF), lv_color_hex(rgb), 128);
    if (core.center() && slot != static_cast<int>(CENTER_SLOT))
      lv_obj_set_style_arc_color(quarter_arcs_[slot], color, LV_PART_MAIN);
    else {
      auto *obj = core.center() ? center_ : core.pie() ? quarters_[slot] : single_;
      lv_obj_set_style_bg_color(obj, color, 0);
    }
  }

  void update_clock(const Core &core) {
    if (clock_) set_text(clock_, core.clock().c_str());
  }

  void update_time(const Core &core) {
    update_clock(core);
    if (!ring_) return;
    auto countdown = core.countdown();
    visible(ring_, countdown.remaining > 0);
    set_text(single_countdown_, !core.pie() ? countdown.text.c_str() : "");
    set_text(center_countdown_, core.center() ? countdown.text.c_str() : "");
    if (countdown.remaining == 0) return;
    auto color = lv_color_hex(core.item(core.main_slot()).rgb);
    auto background = lv_color_mix(color, lv_color_hex(0), 80);
    auto foreground = lv_color_mix(lv_color_hex(0xFFFFFF), color, 160);
    if (!lv_color_eq(lv_obj_get_style_arc_color(ring_, LV_PART_MAIN), background))
      lv_obj_set_style_arc_color(ring_, background, LV_PART_MAIN);
    if (!lv_color_eq(lv_obj_get_style_arc_color(ring_, LV_PART_INDICATOR), foreground))
      lv_obj_set_style_arc_color(ring_, foreground, LV_PART_INDICATOR);
    lv_arc_set_value(ring_, countdown.ring);
  }

 private:
  static void set_text(lv_obj_t *obj, const char *text) {
    if (std::strcmp(lv_label_get_text(obj), text) != 0) lv_label_set_text(obj, text);
  }
  static void visible(lv_obj_t *obj, bool show) {
    if (show) lv_obj_remove_flag(obj, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_add_flag(obj, LV_OBJ_FLAG_HIDDEN);
  }
  static lv_obj_t *box(lv_obj_t *parent, int x, int y, int width, int height, uint32_t rgb, int radius) {
    auto *obj = lv_obj_create(parent);
    lv_obj_remove_style_all(obj);
    lv_obj_remove_flag(obj, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_remove_flag(obj, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_pos(obj, x, y);
    lv_obj_set_size(obj, width, height);
    lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, 0);
    lv_obj_set_style_bg_color(obj, lv_color_hex(rgb), 0);
    lv_obj_set_style_radius(obj, radius, 0);
    return obj;
  }
  static lv_obj_t *label(lv_obj_t *parent, const lv_font_t *font, int x, int y, int width) {
    auto *obj = lv_label_create(parent);
    lv_obj_set_pos(obj, x, y);
    lv_obj_set_width(obj, width);
    lv_obj_set_style_text_font(obj, font, 0);
    lv_obj_set_style_text_color(obj, lv_color_hex(0xFFFFFF), 0);
    lv_obj_set_style_text_align(obj, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_long_mode(obj, LV_LABEL_LONG_WRAP);
    lv_label_set_text(obj, "");
    return obj;
  }
  static void paint(lv_obj_t *obj, lv_obj_t *text, lv_obj_t *icon, const Item &item) {
    lv_obj_set_style_bg_color(obj, lv_color_hex(item.rgb), 0);
    lv_label_set_text(text, item.label.c_str());
    lv_label_set_text(icon, icon_glyph(item.icon));
  }
  lv_obj_t *root_{nullptr}, *single_{nullptr}, *single_label_{nullptr}, *single_icon_{nullptr};
  lv_obj_t *single_value_{nullptr}, *single_countdown_{nullptr}, *ring_{nullptr};
  lv_obj_t *quarters_[4]{}, *quarter_labels_[4]{}, *quarter_icons_[4]{};
  lv_obj_t *quarter_values_[4]{}, *quarter_arcs_[4]{}, *curved_labels_[4]{};
  lv_obj_t *center_{nullptr}, *center_label_{nullptr}, *center_value_{nullptr}, *center_countdown_{nullptr};
  const lv_font_t *text_font_{nullptr}, *clock_font_{nullptr};
  lv_obj_t *hole_{nullptr}, *clock_{nullptr}, *dots_{nullptr}, *dots[6]{};
};
}  // namespace lunactl
