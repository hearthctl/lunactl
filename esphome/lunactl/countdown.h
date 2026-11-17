#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <string>

namespace lunactl {

// Strict, locale-independent parsing of HA's ISO timestamp and timedelta text.
// UTC arithmetic avoids applying HA's local timezone a second time (also at DST).
inline bool countdown_digits(const std::string &text, size_t &pos, size_t count, int &value) {
  value = 0;
  if (pos + count > text.size()) return false;
  for (size_t i = 0; i < count; ++i) {
    char c = text[pos++];
    if (c < '0' || c > '9') return false;
    value = value * 10 + c - '0';
  }
  return true;
}

inline bool countdown_fraction(const std::string &text, size_t &pos, double &fraction) {
  fraction = 0;
  if (pos == text.size() || text[pos] != '.') return true;
  ++pos;
  size_t start = pos;
  double place = 0.1;
  while (pos < text.size() && text[pos] >= '0' && text[pos] <= '9') {
    fraction += (text[pos++] - '0') * place;
    place *= 0.1;
  }
  return pos > start && pos - start <= 6;
}

inline bool countdown_timestamp(const std::string &text, double &timestamp) {
  size_t pos = 0;
  auto separator = [&](char c) { return pos < text.size() && text[pos++] == c; };
  int year, month, day, hour, minute, second;
  if (!countdown_digits(text, pos, 4, year) || !separator('-') ||
      !countdown_digits(text, pos, 2, month) || !separator('-') ||
      !countdown_digits(text, pos, 2, day) || !separator('T') ||
      !countdown_digits(text, pos, 2, hour) || !separator(':') ||
      !countdown_digits(text, pos, 2, minute) || !separator(':') ||
      !countdown_digits(text, pos, 2, second)) return false;
  const int days_in_month[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
  bool leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
  if (year < 1970 || month < 1 || month > 12 || day < 1 ||
      day > days_in_month[month - 1] + (month == 2 && leap ? 1 : 0) ||
      hour > 23 || minute > 59 || second > 59) return false;
  double fraction;
  if (!countdown_fraction(text, pos, fraction) || pos == text.size()) return false;
  int offset = 0;
  if (text[pos] == 'Z') ++pos;
  else {
    char sign = text[pos++];
    int hours, minutes;
    if ((sign != '+' && sign != '-') || !countdown_digits(text, pos, 2, hours) ||
        !separator(':') || !countdown_digits(text, pos, 2, minutes) || hours > 23 || minutes > 59) return false;
    offset = (hours * 60 + minutes) * 60 * (sign == '+' ? 1 : -1);
  }
  if (pos != text.size()) return false;
  // Days since 1970-01-01, using the proleptic Gregorian calendar.
  int64_t days = 365LL * (year - 1970) + (year - 1) / 4 - 1969 / 4 -
      (year - 1) / 100 + 1969 / 100 + (year - 1) / 400 - 1969 / 400;
  for (int m = 1; m < month; ++m) days += days_in_month[m - 1] + (m == 2 && leap ? 1 : 0);
  days += day - 1;
  timestamp = days * 86400 + hour * 3600 + minute * 60 + second + fraction - offset;
  return true;
}

inline bool countdown_duration(const std::string &text, double &seconds) {
  size_t pos = 0;
  auto number = [&](uint64_t &value) {
    value = 0;
    size_t start = pos;
    while (pos < text.size() && text[pos] >= '0' && text[pos] <= '9') {
      value = value * 10 + text[pos++] - '0';
      // Bound both work and arithmetic for malformed HA states.
      if (value > UINT32_MAX) return false;
    }
    return pos > start;
  };
  uint64_t first, hours;
  if (!number(first)) return false;
  uint64_t days = 0;
  if (text.compare(pos, 5, " day,") == 0 || text.compare(pos, 6, " days,") == 0) {
    days = first;
    pos += text[pos + 4] == ',' ? 5 : 6;
    if (pos == text.size() || text[pos++] != ' ' || !number(hours) || hours > 23) return false;
  } else hours = first;
  int minutes, secs;
  if (pos == text.size() || text[pos++] != ':' || !countdown_digits(text, pos, 2, minutes) ||
      pos == text.size() || text[pos++] != ':' || !countdown_digits(text, pos, 2, secs) ||
      minutes > 59 || secs > 59) return false;
  double fraction;
  if (!countdown_fraction(text, pos, fraction) || pos != text.size()) return false;
  seconds = days * 86400.0 + hours * 3600.0 + minutes * 60 + secs + fraction;
  return seconds > 0;
}

struct Countdown {
  uint64_t remaining{0};
  int ring{0};  // Remaining fraction, 0–1000, clamped when HA extends a timer.
  std::string text;
};

inline Countdown countdown_view(const std::string &state, const std::string &finish,
                                const std::string &duration, int64_t now, bool time_valid) {
  double end, total;
  if (!time_valid || state != "active" || !countdown_timestamp(finish, end) ||
      !countdown_duration(duration, total) || end <= now) return {};
  double left = end - now;
  Countdown result;
  result.remaining = static_cast<uint64_t>(std::ceil(left));
  result.ring = static_cast<int>(std::lround(std::min(1.0, left / total) * 1000));
  char text[48];
  auto seconds = static_cast<unsigned long long>(result.remaining);
  if (seconds < 60) std::snprintf(text, sizeof(text), "%llu s", seconds);
  else if (seconds < 3600) std::snprintf(text, sizeof(text), "%llu:%02llu", seconds / 60, seconds % 60);
  else std::snprintf(text, sizeof(text), "%llu:%02llu:%02llu", seconds / 3600, seconds / 60 % 60, seconds % 60);
  result.text = text;
  return result;
}

}  // namespace lunactl
