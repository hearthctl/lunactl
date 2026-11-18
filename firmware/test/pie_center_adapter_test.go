package test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hearthctl/lunactl/internal/testutil"
)

func TestProductionOptionalIcons(t *testing.T) {
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
int main() {
 auto screen = lv_obj_create(nullptr);
 auto ring = lv_arc_create(screen);
 lv_font_t font, icons;
 lunactl::UI ui;
 ui.init(screen, &font, &icons, ring);
 lunactl::Core core;
 core.set_connected(true);
 std::string error;
 JsonDocument manifest;
 deserializeJson(manifest, R"({"schema":1,"pages":[{"type":"single","item":{"label":"Single","color":"#123456","action":{"action":"script.single"},"value":{"format":"{0} °C","refs":[{"entity":"sensor.room"}]}}},{"type":"pie","quarters":[{"label":"Quarter","color":"#654321","action":{"action":"script.quarter"},"value":{"format":"{0} °C","refs":[{"entity":"sensor.room"}]}},null,null,null]}]})");
 for (bool with_icon : {true, false, true, false}) {
  for (auto item : {manifest["pages"][0]["item"].as<JsonObject>(), manifest["pages"][1]["quarters"][0].as<JsonObject>()}) {
   if (with_icon) item["icon"] = "mdi:help-circle";
   else item.remove("icon");
  }
  assert(core.accept(core.begin_fetch(), manifest.as<JsonVariantConst>(), error));
  core.set_state({"sensor.room", ""}, "23.4");
  for (size_t page = 0; page < 2; ++page) {
   assert(core.show_page(page));
   ui.render(core);
   auto label = text(screen, page == 0 ? "Single" : "Quarter");
   auto value = text(screen, "23.4 °C");
   assert(label && value && label->parent == value->parent);
   assert(label->x == (page == 0 ? 20 : 54) && label->y == (page == 0 ? 120 : 138));
   assert(value->x == (page == 0 ? 20 : 54) && value->y == (page == 0 ? 174 : 172));
   assert(label->parent->width == (page == 0 ? 280 : 230));
   assert(label->parent->bg_color == (page == 0 ? 0x123456u : 0x654321u));
   int icon_labels = 0;
   for (auto child : label->parent->children) if (child->font == &icons) {
    ++icon_labels;
    assert(child->text == (with_icon ? lunactl::icon_glyph("mdi:help-circle") : ""));
    assert(child->x == (page == 0 ? 0 : 54) && child->y == (page == 0 ? 45 : 80));
   }
   assert(icon_labels == 1 && !visible(ring));
   assert(bool(text(screen, "--:--")) == (page == 1));
  }
 }
}
`, map[string]string{"lvgl.h": countdownLVGLStub})
}

// Exercise the production UI, observing visible text, arc geometry, fonts,
// colours and page transitions. The firmware build checks the real LVGL APIs.
func TestProductionPieCenter(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(testutil.Root(), "esphome/lunactl.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	for _, flag := range []string{"LV_USE_ARCLABEL=1", "LV_DRAW_SW_SUPPORT_A8=1", "LV_USE_FLOAT=1"} {
		if !strings.Contains(string(raw), "- -D"+flag) {
			t.Fatalf("curved labels require %s", flag)
		}
	}
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
int main() {
 auto screen = lv_obj_create(nullptr);
 auto ring = lv_arc_create(screen);
 lv_font_t font, icons, small, large;
 lunactl::UI ui;
 ui.init(screen, &font, &icons, ring, &small, &large);
 lunactl::Core core;
 core.set_connected(true);
 std::string error;
 const char *manifest = R"({"schema":1,"pages":[{"type":"pie","quarters":[{"label":"Kühlen","color":"#2049D8","icon":"mdi:snowflake","action":{"action":"script.cool"},"value":{"format":"Quarter {0}","refs":[{"entity":"sensor.room"}]},"countdown":"timer.run"},{"label":"Heizen","color":"#B71C1C","action":{"action":"script.heat"}},{"label":"Schlafen gehen","color":"#374151","action":{"action":"script.sleep"}},null],"center":{"label":"Klima-Lauf","color":"#111827","action":{"action":"script.center"},"value":{"format":"{0} °C","refs":[{"entity":"sensor.room","decimals":1,"decimal_comma":true}]},"countdown":"timer.run"}},{"type":"pie","quarters":[{"label":"Normal quarter","color":"#123456","action":{"action":"script.normal"}},null,null,null]},{"type":"single","item":{"label":"Single","color":"#654321","action":{"action":"script.single"},"countdown":"timer.run"}}]})";
 assert(core.accept_json(core.begin_fetch(), manifest, error));
 core.set_time(19, 42);
 core.set_timestamp(1794913200);
 core.set_state({"sensor.room", ""}, "23.4");
 core.set_state({"timer.run", ""}, "active");
 core.set_state({"timer.run", "finishes_at"}, "2026-11-17T11:01:00Z");
 core.set_state({"timer.run", "duration"}, "0:01:00");
 ui.render(core);
 auto label = text(screen, "Klima-Lauf");
 assert(label && label->parent->bg_color == 0x111827);
 assert(label->parent->width == 280 && label->parent->height == 280);
 assert(text(screen, "23,4 °C") && text(screen, "1:00"));
 assert(text(screen, "1:00")->font == &large);
 auto clock = text(screen, "19:42");
 assert(clock && clock->x == 201 && clock->y == 3 && clock->font == &small);
 assert(!text(screen, "Quarter 23.4") && !text(screen, lunactl::icon_glyph("mdi:snowflake")));
 assert(visible(ring) && ring->value == 1000 && ring->arc_color == 0x111827);
 int arcs = 0, labels = 0;
 for (auto child : ring->parent->children) {
  if (!visible(child)) continue;
  if (child->kind == "arclabel") {
   assert(child->width == 466 && child->height == 466 && child->radius == 200);
   assert(child->size == 74 && !(child->flags & LV_OBJ_FLAG_CLICKABLE));
   assert(child->direction == (labels < 2 ? LV_ARCLABEL_DIR_CLOCKWISE : LV_ARCLABEL_DIR_COUNTER_CLOCKWISE));
   assert(child->start == lunactl::QUARTER_ANGLES[labels] - 37);
   if (labels == 0) assert(child->text == "Kühlen");
   if (labels == 2) assert(child->text == "Schlafen gehen");
   if (labels == 3) assert(child->text.empty());
   ++labels;
  }
  if (child->kind == "box" && child->children.size() == 1 && child->children[0]->kind == "arc") {
   auto clip = child;
   child = clip->children[0];
   assert(clip->width == 233 && clip->height == 233);
   assert(clip->x == (arcs == 1 || arcs == 2 ? 233 : 0));
   assert(clip->y == (arcs >= 2 ? 233 : 0));
   assert(child->x + clip->x == 0 && child->y + clip->y == 0);
   assert(child->width == 466 && child->height == 466 && child->arc_width == 65);
   assert(child->size == 74 && !(child->flags & LV_OBJ_FLAG_CLICKABLE));
   if (arcs == 0) assert(child->arc_color == 0x2049D8);
   if (arcs == 3) assert(child->arc_color == 0x202020);
   ++arcs;
  }
 }
 assert(arcs == 4 && labels == 4);
 ui.highlight(core, 233, 233);
 assert(label->parent->bg_color == 0xFFFFFF);
 ui.render(core);
 assert(label->parent->bg_color == 0x111827);
 ui.highlight(core, 90, 90);
 assert(text(screen, "Kühlen"));
 core.set_state({"sensor.room", ""}, "22.9");
 ui.render(core);
 assert(text(screen, "22,9 °C") && !text(screen, "23,4 °C"));
 core.set_timestamp(1794913218);
 ui.update_time(core);
 assert(ring->value == 700 && text(screen, "42 s") && !text(screen, "1:00"));
 core.set_state({"timer.run", ""}, "paused");
 ui.render(core);
 assert(!visible(ring) && !text(screen, "42 s"));
 assert(core.show_page(1));
 ui.render(core);
 assert(text(screen, "Normal quarter") && !text(screen, "Klima-Lauf"));
 assert(!text(screen, "Kühlen") && !visible(ring));
 clock = text(screen, "19:42");
 assert(clock && clock->x == 177 && clock->y == 215 && clock->font == &font);
 core.set_state({"timer.run", ""}, "active");
 assert(core.show_page(2));
 ui.render(core);
 assert(text(screen, "Single") && !text(screen, "19:42") && visible(ring));
 assert(text(screen, "42 s")->font == &font && ring->arc_color == 0x654321);
 assert(core.show_page(0));
 ui.render(core);
 assert(text(screen, "Klima-Lauf") && text(screen, "42 s")->font == &large && visible(ring));
 // Removing a countdown/value and leaving empty quarters clears all old output.
 assert(core.accept_json(core.begin_fetch(), R"({"schema":1,"pages":[{"type":"pie","quarters":[null,null,null,null],"center":{"label":"Papa rufen","color":"#BB1260","action":{"action":"script.papa"}}}]})", error));
 ui.render(core);
 assert(text(screen, "Papa rufen") && !text(screen, "Klima-Lauf") && !text(screen, "22,9 °C"));
 assert(!visible(ring) && !text(screen, "42 s") && !text(screen, "Kühlen"));
 // Disconnected keeps the Pie, including its clock.
 core.set_connected(false);
 ui.render(core);
 assert(text(screen, "Papa rufen") && text(screen, "19:42"));
}
`, map[string]string{"lvgl.h": countdownLVGLStub})
}

func TestProductionPressFeedback(t *testing.T) {
	checkAdapter(t, `#include "ui.h"
#include <cassert>
int main() {
 auto screen = lv_obj_create(nullptr);
 auto ring = lv_arc_create(screen);
 lv_font_t font;
 lunactl::UI ui;
 ui.init(screen, &font, &font, ring);
 lunactl::Core core;
 core.set_connected(true);
 std::string error;
 JsonDocument manifest;
 deserializeJson(manifest, R"({"schema":1,"pages":[{"type":"single","item":{"label":"Item","color":"#000000","action":{"action":"script.run"}}}]})");
 struct Case { const char *color; unsigned original, pressed; };
 for (const auto &test : {Case{"#000000", 0x000000, 0x808080}, Case{"#FFFFFF", 0xFFFFFF, 0x7F7F7F}, Case{"#F7C844", 0xF7C844, 0x7B6321}, Case{"#111827", 0x111827, 0x888B93}}) {
  manifest["pages"][0]["item"]["color"] = test.color;
  assert(core.accept(core.begin_fetch(), manifest.as<JsonVariantConst>(), error));
  ui.render(core);
  lv_obj_t *item = nullptr;
  for (auto root : screen->children) for (auto child : root->children)
   for (auto label : child->children) if (label->text == "Item") item = child;
  assert(item && item->bg_color == test.original);
  assert(core.press(233, 233, 1));
  ui.highlight(core, 233, 233);
  assert(item->bg_color == test.pressed);
  assert(core.release(233, 233, 2) == 0);
  ui.render(core);
  assert(item->bg_color == test.original);
  ui.highlight(core, -1, -1);
  assert(item->bg_color == test.original);
 }
}
`, map[string]string{"lvgl.h": strings.Replace(countdownLVGLStub,
		"inline unsigned lv_color_mix(unsigned a, unsigned, int) { return a; }",
		`inline unsigned lv_color_mix(unsigned a, unsigned b, int mix) {
 unsigned color = 0;
 for (int shift : {0, 8, 16}) color |= ((((a >> shift) & 255) * mix + ((b >> shift) & 255) * (255 - mix)) / 255) << shift;
 return color;
 }`, 1)})
}
