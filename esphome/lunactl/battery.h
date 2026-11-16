#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

namespace lunactl {

// M5PM1: PWR_SRC (0x04), VBAT_L/H (0x22/0x23, little-endian mV).
// https://m5stack-doc.oss-cn-shenzhen.aliyuncs.com/1207/M5PM1_Datasheet_CN.pdf
class Battery {
 public:
  // read_register(reg, bytes, length) returns false on any I2C error.
  template<typename ReadRegister> bool poll(ReadRegister read_register) {
    level_ = -1;
    // The PMIC may NACK the first transfer after an idle period.
    for (int attempt = 0; attempt < 3; ++attempt) {
      uint8_t source = 0, voltage[2] = {};
      if (!read_register(0x04, &source, 1) ||
          !read_register(0x22, voltage, 2)) continue;
      const unsigned mv = voltage[0] | (unsigned(voltage[1]) << 8);
      // BAT must be present. Reject uninitialised/absent/out-of-range data;
      // USB input voltage must never masquerade as a full battery.
      if (!(source & 0x04) || (source & 0xF8) || mv < 2400 || mv > 4400) continue;
      // Voltage estimate for the StopWatch's single Li-ion cell, not a fuel
      // gauge: 3.3 V empty, 4.2 V full. USB does not force the level to 100%.
      level_ = mv <= 3300 ? 0 : mv >= 4200 ? 100 : (mv - 3300) * 100 / 900;
      return true;
    }
    return false;
  }

  int level() const { return level_; }
  bool low() const { return level_ >= 0 && level_ < 20; }
  const char *hint() const { return low() ? "Zurück an die Halterung" : ""; }
  std::string text() const { return level_ < 0 ? "Akku -- %" : "Akku " + std::to_string(level_) + " %"; }

 private:
  int level_{-1};
};

}  // namespace lunactl
