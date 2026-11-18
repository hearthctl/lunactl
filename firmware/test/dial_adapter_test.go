package test

import "testing"

// Exercise the production Dial UI: layout, Aktiv colours, hidden minus/plus,
// the bottom-open ring and the switch back to a Single page on the same UI.
func TestProductionDial(t *testing.T) {
	checkAdapter(t, `#include "ui.h"
#include <cassert>
bool visible(lv_obj_t *obj) {
 return obj && !(obj->flags & LV_OBJ_FLAG_HIDDEN) && (!obj->parent || visible(obj->parent));
}
lv_obj_t *text(lv_obj_t *obj, const std::string &value) {
 if (!visible(obj)) return nullptr;
 if (obj->text == value) return obj;
 for (auto child : obj->children) if (auto found = text(child, value)) return found;
 return nullptr;
}
// The visible round button whose box is at (x, y), 88 px wide.
lv_obj_t *button(lv_obj_t *obj, int x, int y) {
 if (!visible(obj)) return nullptr;
 if (obj->kind == "box" && obj->x == x && obj->y == y && obj->width == 88 && obj->height == 88) return obj;
 for (auto child : obj->children) if (auto found = button(child, x, y)) return found;
 return nullptr;
}
int main() {
 auto screen = lv_obj_create(nullptr);
 auto ring = lv_arc_create(screen);
 lv_font_t font, icons, small, large, big;
 lunactl::UI ui;
 ui.init(screen, &font, &icons, ring, &small, &large, &big);
 lunactl::Core core;
 core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"pages":[{"type":"dial",
  "status":{"format":"{0}","refs":[{"entity":"climate.room","attribute":"hvac_action","map":{"cooling":"Kühlt","off":"Klima aus"}}]},
  "value":{"format":"{0}°","refs":[{"entity":"input_number.setpoint","decimals":0}]},
  "caption":{"format":"{0} °C","refs":[{"entity":"sensor.room","decimals":1,"decimal_comma":true}]},
  "minus":{"label":"Kälter","color":"#374151","action":{"action":"script.minus"},"active":{"entity":"climate.room","attribute":"hvac_mode","states":["cool"]}},
  "plus":{"label":"Wärmer","color":"#4B5563","action":{"action":"script.plus"},"active":{"entity":"climate.room","attribute":"hvac_mode","states":["cool"]}},
  "items":[{"label":"Kühlen","icon":"mdi:snowflake","color":"#3B82F6","action":{"action":"script.cool"},"active":{"entity":"climate.room","attribute":"hvac_mode","states":["cool"]}},
   null,
   {"label":"Heizen","icon":"mdi:fire","color":"#F0782A","action":{"action":"script.heat"},"active":{"entity":"climate.room","attribute":"hvac_mode","states":["heat"]}}],
  "countdown":"timer.run"},
  {"type":"single","item":{"label":"Single","color":"#654321","action":{"action":"script.single"},"countdown":"timer.run"}}]})";
 assert(core.accept_json(core.begin_fetch(), manifest, error));
 core.set_time(11, 0);
 core.set_timestamp(1794913200);
 core.set_state({"climate.room", "hvac_mode"}, "cool");
 core.set_state({"climate.room", "hvac_action"}, "cooling");
 core.set_state({"input_number.setpoint", ""}, "20");
 core.set_state({"sensor.room", ""}, "21.64");
 core.set_state({"timer.run", ""}, "active");
 core.set_state({"timer.run", "finishes_at"}, "2026-11-17T11:24:00Z");
 core.set_state({"timer.run", "duration"}, "0:30:00");
 ui.render(core);

 auto status = text(screen, "Kühlt · noch 24 min");
 assert(status && status->font == &font && status->text_color == 0x3B82F6);
 assert(status->x == 63 && status->y == 82 && status->width == 340);
 auto value = text(screen, "20°");
 assert(value && value->font == &big && value->text_color == 0xFFFFFF);
 assert(value->x == 133 && value->y == 132 && value->width == 200);
 auto caption = text(screen, "21,6 °C");
 assert(caption && caption->font == &font && caption->text_color == 0x8A93A3);
 assert(caption->x == 133 && caption->y == 248 && caption->width == 200);
 assert(text(screen, "11:00") && text(screen, "11:00")->y == 34);

 // Minus and plus: dark circles outlined in their own colour, with white bars.
 auto minus = button(screen, 40, 152), plus = button(screen, 338, 152);
 assert(minus && minus->radius == 44 && minus->bg_color == 0x1D2129);
 assert(minus->border_color == 0x374151 && minus->border_width == 3);
 assert(plus && plus->border_color == 0x4B5563);
 int minus_bars = 0, plus_bars = 0;
 for (auto bar : minus->children) minus_bars += visible(bar) && bar->bg_color == 0xFFFFFF;
 for (auto bar : plus->children) plus_bars += visible(bar) && bar->bg_color == 0xFFFFFF;
 assert(minus_bars == 1 && plus_bars == 2);

 // Bottom Slots: active filled with a halo, inactive dark with a coloured icon, empty hidden.
 auto cool = button(screen, 87, 314), empty = button(screen, 189, 314), heat = button(screen, 291, 314);
 assert(cool && cool->bg_color == 0x3B82F6 && cool->outline_width == 6);
 assert(cool->children.size() == 1 && cool->children[0]->font == &icons);
 assert(cool->children[0]->text == lunactl::icon_glyph("mdi:snowflake") && cool->children[0]->text_color == 0xFFFFFF);
 assert(heat && heat->bg_color == 0x1D2129 && heat->outline_width == 0);
 assert(heat->children[0]->text == lunactl::icon_glyph("mdi:fire") && heat->children[0]->text_color == 0xF0782A);
 assert(!empty);

 // Ring: 270° open at the bottom, in the active colour.
 assert(visible(ring) && ring->x == 9 && ring->y == 9 && ring->width == 448 && ring->height == 448);
 assert(ring->rotation == 135 && ring->start == 0 && ring->size == 270 && ring->arc_width == 12);
 assert(ring->value == 800 && ring->indicator_color == 0x3B82F6 && ring->arc_color == 0x1B1E25);

 // Off: minus/plus disappear, nothing active, no ring, grey status.
 core.set_state({"climate.room", "hvac_mode"}, "off");
 core.set_state({"climate.room", "hvac_action"}, "off");
 core.set_state({"timer.run", ""}, "idle");
 ui.render(core);
 assert(!button(screen, 40, 152) && !button(screen, 338, 152));
 assert(text(screen, "Klima aus") && text(screen, "Klima aus")->text_color == 0x8A93A3);
 assert(button(screen, 87, 314)->bg_color == 0x1D2129 && button(screen, 87, 314)->outline_width == 0);
 assert(!visible(ring));

 // The same UI renders a Single page with its own ring geometry afterwards.
 core.set_state({"timer.run", ""}, "active");
 assert(core.show_page(1));
 ui.render(core);
 assert(text(screen, "Single") && !button(screen, 87, 314) && !text(screen, "20°"));
 assert(visible(ring) && ring->x == 77 && ring->width == 312 && ring->rotation == 270);
 assert(ring->start == 0 && ring->size == 360 && ring->arc_width == 8);
}
`, map[string]string{"lvgl.h": countdownLVGLStub})
}
