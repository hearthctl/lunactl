// Port of esphome/lunactl/countdown.h. Time is Unix seconds, not local time.
export function countdownTimestamp(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(text);
  if (!m || m[0] !== text) return NaN;
  const [, year, month, day, hour, minute, second] = m.map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1970 || month < 1 || month > 12 || day < 1 || day > days[month - 1] ||
      hour > 23 || minute > 59 || second > 59 || Number(m[10] || 0) > 23 || Number(m[11] || 0) > 59) return NaN;
  const offset = m[8] === "Z" ? 0 : (Number(m[10]) * 3600 + Number(m[11]) * 60) * (m[9] === "+" ? 1 : -1);
  return Date.UTC(year, month - 1, day, hour, minute, second) / 1000 + Number(`0.${m[7] || 0}`) - offset;
}

export function countdownDuration(text) {
  const m = /^(?:(\d+) days?, )?(\d+):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/.exec(text);
  if (!m || m[0] !== text || Number(m[1] || 0) > 0xffffffff || Number(m[2]) > 0xffffffff ||
      (m[1] !== undefined && Number(m[2]) > 23) || Number(m[3]) > 59 || Number(m[4]) > 59) return NaN;
  return Number(m[1] || 0) * 86400 + Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]) + Number(`0.${m[5] || 0}`);
}

export function countdownView(timer, now) {
  if (timer?.state !== "active" || !Number.isFinite(now)) return null;
  const end = countdownTimestamp(timer.attributes?.finishes_at);
  const total = countdownDuration(timer.attributes?.duration);
  if (!(end > now) || !(total > 0)) return null;
  const left = end - Math.floor(now);
  const remaining = Math.ceil(left);
  const pad = (n) => String(n).padStart(2, "0");
  const text = remaining < 60 ? `${remaining} s` : remaining < 3600 ?
    `${Math.floor(remaining / 60)}:${pad(remaining % 60)}` :
    `${Math.floor(remaining / 3600)}:${pad(Math.floor(remaining / 60) % 60)}:${pad(remaining % 60)}`;
  return {remaining, ring: Math.round(Math.min(1, left / total) * 1000), text};
}
