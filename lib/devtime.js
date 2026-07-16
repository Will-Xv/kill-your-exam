// 开发者「日期穿越」+ 用户时区感知的「今天」。
// - dayOffset:按【当前用户】隔离的整数天偏移(测多天剧本用),offset=0 时无影响,绝不全服务器生效。
// - 时区:主「今天」按【当前用户的设备时区】(tz:<userId>,由 AppShell 打开应用时上报)计算,
//   修「服务器在 UTC、偏西时区用户日期 +1 天」的 bug。无用户/无时区时退回服务器本地(原行为)。
import { getSetting } from "@/lib/db";
import { currentUserId } from "@/lib/reqctx";

export function dayOffset() {
  try {
    const uid = currentUserId();
    if (!uid) return 0;
    const v = parseInt(getSetting(`dev_day_offset:${uid}`, "0"), 10);
    return Number.isFinite(v) ? v : 0;
  } catch { return 0; }
}

// 当前用户的设备时区(IANA,如 America/Toronto);无则 null。
function userTz() {
  try {
    const uid = currentUserId();
    if (!uid) return null;
    const t = getSetting(`tz:${uid}`, "");
    return (t && /\//.test(t)) ? t : null;
  } catch { return null; }
}

// 把某个时间点格式化成 YYYY-MM-DD:有用户时区就按用户本地日,否则退回服务器本地。
function fmtDay(d) {
  const tz = userTz();
  if (tz) { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d); } catch {} }
  return d.toLocaleDateString("sv-SE");
}

export function nowMs() { return Date.now() + dayOffset() * 86400000; }
// 偏移后的「今天」(按用户时区)YYYY-MM-DD——今日任务日期键、复习到期比较、倒计时都用它。
export function todayStr() { return fmtDay(new Date(nowMs())); }
// 用户本地【真实】今天(不含 offset)——给日期穿越卡显示 real、算 offset 基准。
export function realTodayStr() { return fmtDay(new Date()); }
// 偏移后的写入时间戳(UTC "YYYY-MM-DD HH:MM:SS")——时间点与时区无关,做题/洞察写入用。
export function nowStamp() { return new Date(nowMs()).toISOString().slice(0, 19).replace("T", " "); }
