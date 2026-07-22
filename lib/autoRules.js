// 【循环自动规则】用户不在时也能定期自动执行:每天/每周到点触发——发定时提醒,或自动汇总本周计划投进收件箱+推送。
import db from "@/lib/db";
import { DICTS, ZH_TW, ZH_HK } from "@/lib/translations";
import { toTradTW, toTradHK } from "@/lib/s2t";
function _t(userId, zh) {
  try {
    const u = db.prepare("SELECT lang FROM users WHERE id=?").get(userId);
    const lang = (u && u.lang) || "zh";
    if (lang === "zh") return zh;
    // 繁体走专用词典,没命中就【简转繁字符级兜底】——绝不能像其它语言那样退回简体原文
    if (lang === "zh-TW") return (ZH_TW && ZH_TW[zh]) || toTradTW(zh);
    if (lang === "zh-HK") return (ZH_HK && ZH_HK[zh]) || toTradHK(zh);
    return (DICTS[lang] && DICTS[lang][zh]) || zh;
  } catch { return zh; }
}
import { nowMs, nowStamp } from "@/lib/devtime";
import { sendLetter } from "@/lib/inbox";
import { pushUser } from "@/lib/notify";
import { dayPlanView } from "@/lib/dayPlan";

const fmt = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

// 下一次触发的时间戳(ms)。freq: 'daily' | 'weekly';weekday: 0=周日..6=周六(周任务用,默认周一=1);hour/minute 本地时刻。
export function computeNextRun(freq, weekday, hour, minute, fromMs) {
  const target = new Date(fromMs);
  target.setHours(Number.isFinite(hour) ? hour : 9, Number.isFinite(minute) ? minute : 0, 0, 0);
  if (freq === "weekly") {
    const wd = (((weekday == null ? 1 : Number(weekday)) % 7) + 7) % 7;
    let add = (wd - target.getDay() + 7) % 7;
    target.setDate(target.getDate() + add);
    if (target.getTime() <= fromMs) target.setDate(target.getDate() + 7);
  } else {
    if (target.getTime() <= fromMs) target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

export function addAutoRule(userId, examId, { kind = "reminder", freq = "weekly", weekday = 1, hour = 9, minute = 0, text = "" } = {}) {
  const next = computeNextRun(freq, weekday, hour, minute, nowMs());
  const info = db.prepare("INSERT INTO auto_rules(user_id,exam_id,kind,freq,weekday,hour,minute,text,next_run,active) VALUES(?,?,?,?,?,?,?,?,?,1)")
    .run(userId, examId || null, kind, freq, Number(weekday) || 0, Number(hour) || 0, Number(minute) || 0, String(text || "").slice(0, 300), fmt(next));
  return { id: info.lastInsertRowid, nextRun: fmt(next), kind, freq, weekday, hour, minute };
}
export function listAutoRules(userId) {
  try { return db.prepare("SELECT id, kind, freq, weekday, hour, minute, text, next_run, active FROM auto_rules WHERE user_id=? AND active=1 ORDER BY next_run").all(userId); } catch { return []; }
}
export function deleteAutoRule(userId, id) {
  try { const r = db.prepare("DELETE FROM auto_rules WHERE user_id=? AND id=?").run(userId, Number(id)); return r.changes > 0; } catch { return false; }
}

function weekPlanText(userId) {
  let view = null; try { view = dayPlanView(userId); } catch {}
  if (!view) return null;
  const endOfWeek = (() => { const d = new Date(nowMs()); const dow = d.getDay(); d.setDate(d.getDate() + (dow === 0 ? 0 : 7 - dow)); return d.toISOString().slice(0, 10); })();
  const lines = [];
  for (const it of view.dueNow || []) lines.push("• " + it.title + (it.date < view.today ? "(顺延)" : ""));
  for (const f of (view.future || [])) if (f.date <= endOfWeek) for (const it of f.items) lines.push(`• ${f.date.slice(5)} ${it.title}`);
  if (!lines.length) return null;
  return lines.slice(0, 20).join("\n");
}

async function execRule(r) {
  if (r.kind === "plan_digest") {
    const body = weekPlanText(r.user_id);
    const text = body ? "本周计划:\n" + body : "本周暂无排期。要不要让杀手排一下?";
    try { sendLetter(r.user_id, { title: "🗓️ 本周计划", body: text, key: `auto-${r.id}-${nowStamp().slice(0, 10)}` }); } catch {}
    try { await pushUser(r.user_id, { title: "🗓️ 本周计划", body: (body || "").slice(0, 120) || "点开看本周安排", url: "/plan" }); } catch {}
  } else { // reminder:收件箱留一份 + 应用外推送(推送要主人开了通知才收得到,收件箱那份保证不丢)
    const text = r.text || "该学习啦";
    try { sendLetter(r.user_id, { title: "⏰ " + _t(r.user_id, "定时提醒"), body: text, key: `auto-${r.id}-${nowStamp().slice(0, 13)}` }); } catch {}
    try { await pushUser(r.user_id, { title: "⏰ Kill Your Exam", body: text, url: "/" }); } catch {}
  }
}

export async function runDueAutoRules() {
  let rows = [];
  try { rows = db.prepare("SELECT * FROM auto_rules WHERE active=1 AND next_run <= ?").all(nowStamp()); } catch { return 0; }
  for (const r of rows) {
    try { await execRule(r); } catch {}
    try { const nn = computeNextRun(r.freq, r.weekday, r.hour, r.minute, nowMs() + 60000); db.prepare("UPDATE auto_rules SET next_run=?, last_run=? WHERE id=?").run(fmt(nn), nowStamp(), r.id); } catch {}
  }
  return rows.length;
}

// 后台轮询:每分钟扫一次到点的自动规则并执行(服务进程常驻→用户不在也能跑)。只启动一次。
export function startAutoRuleLoop() {
  if (globalThis.__kye_autorule_loop) return;
  globalThis.__kye_autorule_loop = true;
  const tick = async () => { try { await runDueAutoRules(); } catch {} };
  try { setInterval(tick, 60000); } catch {}
  setTimeout(tick, 8000);
}
