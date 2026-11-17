#pragma once

#include "core.h"
#include "lvgl.h"

namespace lunactl {

// Allocated once. The core owns page selection, hit testing and action selection.
class UI {
 public:
  void init(lv_obj_t *parent, const lv_font_t *text, const lv_font_t *icons) {
    if (root_) return;
    root_ = box(parent, 0, 0, 466, 466, 0x000000, 233);
    lv_obj_set_style_clip_corner(root_, true, 0);
    single_ = box(root_, 93, 93, 280, 280, 0, 140);
    single_icon_ = label(single_, icons, 0, 45, 280);
    single_label_ = label(single_, text, 20, 120, 240);
    for (int slot = 0; slot < 4; ++slot) {
      int x = slot == 1 || slot == 2 ? 236 : 0;
      int y = slot >= 2 ? 236 : 0;
      quarters_[slot] = box(root_, x, y, 230, 230, 0x202020, 0);
      // Place text toward the middle of each quarter, inside the round edge.
      int cx = x == 0 ? 134 : 98;
      int cy = y == 0 ? 134 : 98;
      quarter_icons_[slot] = label(quarters_[slot], icons, cx - 80, cy - 54, 160);
      quarter_labels_[slot] = label(quarters_[slot], text, cx - 80, cy + 4, 160);
    }
    hole_ = box(root_, 177, 177, 112, 112, 0x000000, 56);
    clock_ = label(hole_, text, 0, 38, 112);
    dots_ = box(root_, 0, 437, 1, 28, 0x000000, 14);
    for (int i = 0; i < 6; ++i) dots[i] = box(dots_, 11 + i * 18, 9, 10, 10, 0x666666, 5);
  }

  void render(const Core &core) {
    visible(root_, core.tappable());
    if (!core.tappable()) return;
    visible(single_, !core.pie());
    visible(hole_, core.pie());
    if (!core.pie()) {
      paint(single_, single_label_, single_icon_, core.item());
    }
    for (size_t slot = 0; slot < 4; ++slot) {
      visible(quarters_[slot], core.pie());
      if (!core.pie()) continue;
      if (core.slot_tappable(slot)) paint(quarters_[slot], quarter_labels_[slot], quarter_icons_[slot], core.item(slot));
      else {
        lv_obj_set_style_bg_color(quarters_[slot], lv_color_hex(0x202020), 0);
        lv_label_set_text(quarter_labels_[slot], "");
        lv_label_set_text(quarter_icons_[slot], "");
      }
    }
    update_clock(core);
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
    auto *obj = core.pie() ? quarters_[slot] : single_;
    lv_obj_set_style_bg_color(obj, lv_color_mix(lv_color_hex(0xFFFFFF), lv_color_hex(core.item(slot).rgb), 40), 0);
  }

  void update_clock(const Core &core) {
    if (clock_) lv_label_set_text(clock_, core.clock().c_str());
  }

 private:
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
    lv_label_set_text(icon, resolve_icon(item.icon.c_str()).glyph);
  }
  lv_obj_t *root_{nullptr}, *single_{nullptr}, *single_label_{nullptr}, *single_icon_{nullptr};
  lv_obj_t *quarters_[4]{}, *quarter_labels_[4]{}, *quarter_icons_[4]{};
  lv_obj_t *hole_{nullptr}, *clock_{nullptr}, *dots_{nullptr}, *dots[6]{};
};
}  // namespace lunactl
