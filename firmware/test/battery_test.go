package test

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"

	"github.com/hearthctl/lunactl/internal/testutil"
)

// Compile the real polling and rendering lambdas with a scripted PMIC and LVGL
// labels. This catches register/byte order errors and stale UI or sensor values.
func TestProductionBatteryAdapter(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(testutil.Root(), "esphome/lunactl.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	extract := func(pattern string) string {
		t.Helper()
		match := regexp.MustCompile(pattern).FindStringSubmatch(string(raw))
		if match == nil {
			t.Fatalf("production battery block missing: %s", pattern)
		}
		return match[1]
	}
	poll := extract(`(?s)    update_interval: 10s\n    lambda: \|-\n(.*?)\n\n`)
	render := extract(`(?s)  - id: render_battery\n    then:\n      - lambda: \|-\n(.*?)\n  - id:`)
	address := extract(`(?s)i2c_device:\n  id: pmic\n  address: (0x[0-9A-Fa-f]+)`)
	source := `#include "battery.h"
#include <cstring>
#include <cmath>
#include <functional>
#include <stdexcept>
#define id(name) name
#define ESP_LOGW(...) (++warnings)
namespace i2c { constexpr int ERROR_OK = 0; }
int warnings = 0, delays = 0;
void delay(int ms) { if (ms != 1) throw std::runtime_error("retry delay"); ++delays; }
const char *lv_label_get_text(const std::string &label) { return label.c_str(); }
int label_writes = 0;
void lv_label_set_text(std::string &label, const char *text) { ++label_writes; label = text; }
struct Render { std::function<void()> callback; void execute() { callback(); } };
struct PMIC {
 int calls = 0, nack = 0;
 bool broken_voltage = false;
 uint8_t source = 4;
 uint16_t mv = 3471;
 int read_register(uint8_t reg, uint8_t *data, size_t length) {
   ++calls;
   if (nack > 0) { --nack; return 1; }
   if (reg == 4 && length == 1) { data[0] = source; return 0; }
   if (reg == 34 && length == 2) {
     if (broken_voltage) return 1;
     data[0] = mv & 255; data[1] = mv >> 8; return 0;
   }
   throw std::runtime_error("unexpected PMIC register or length");
 }
};
PMIC pmic;
int main() {
 static_assert(` + address + ` == 0x6E, "PMIC address");
 lunactl::Battery battery;
 std::string battery_level_text, battery_hint;
 Render render_battery{[&]() { ` + render + ` }};
 auto poll = [&]() -> float { ` + poll + ` };
 render_battery.execute();
 if (battery_level_text != "Akku -- %" || !battery_hint.empty()) return 1;
 pmic.nack = 1;
 if (poll() != 19 || battery_hint != "Zurück an die Halterung" ||
     battery_level_text != "Akku 19 %" || pmic.calls != 3 || delays != 1 || warnings) return 2;
 label_writes = 0;
 if (poll() != 19 || label_writes != 0) return 10;
 // Adding USB must not report the 5V supply as a full battery or hide the hint.
 pmic.source = 5;
 if (poll() != 19 || battery_hint.empty()) return 3;
 pmic.mv = 3480;
 if (poll() != 20 || !battery_hint.empty() || battery_level_text != "Akku 20 %") return 4;
 pmic.mv = 3471;
 if (poll() != 19 || battery_hint.empty()) return 5;
 pmic.broken_voltage = true;
 pmic.calls = 0;
 if (!std::isnan(poll()) || pmic.calls != 6 || warnings != 1 ||
     !battery_hint.empty() || battery_level_text != "Akku -- %") return 6;
 pmic.broken_voltage = false;
 pmic.source = 4;
 pmic.mv = 4200;
 if (poll() != 100 || !battery_hint.empty() || battery_level_text != "Akku 100 %") return 7;
 pmic.nack = 3;
 pmic.calls = 0;
 if (!std::isnan(poll()) || pmic.calls != 3 || warnings != 2 || battery_level_text != "Akku -- %") return 8;
 pmic.source = 1; // USB without a battery is unknown, never zero or full.
 if (!std::isnan(poll()) || !battery_hint.empty()) return 9;
}
`
	checkAdapter(t, source)
}
