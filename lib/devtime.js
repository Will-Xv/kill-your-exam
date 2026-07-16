// 开发者「日期穿越」:一个全局 day offset(整数天),让整个应用把「今天」当成 真实今天 + offset。
// 用途:测剧本六(连用多天)时无需真的等好几天——把日期往前拨,看复习到期、今日任务是否按天正确演进。
// offset=0(默认)时,一切行为与从前完全一致,不影响真实用户。
import { getSetting } from "@/lib/db";

export function dayOffset() {
  try { const v = parseInt(getSetting("dev_day_offset", "0"), 10); return Number.isFinite(v) ? v : 0; } catch { return 0; }
}
// 偏移后的「现在」(毫秒)——用于基于 Date.now() 的衰减/年龄计算。
export function nowMs() { return Date.now() + dayOffset() * 86400000; }
// 偏移后的「今天」本地日期串 YYYY-MM-DD——今日任务日期键、复习到期比较都用它。
export function todayStr() { return new Date(nowMs()).toLocaleDateString("sv-SE"); }
// 偏移后的写入时间戳(UTC "YYYY-MM-DD HH:MM:SS",与 SQLite datetime('now') 同格);offset=0 时即当前 UTC。
// 用于做题/洞察等写入,使日期穿越期间"当天做题计数"与虚拟日期一致。
export function nowStamp() { return new Date(nowMs()).toISOString().slice(0, 19).replace("T", " "); }
