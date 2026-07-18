// 【学习进程时间表】按考试日期 / 学到某天 / 学N周 / 没时间要求,把知识点铺进按天排期(跳过不学的日子),并估算大概学多久。
import { leafKpList } from "@/lib/mastery";
import { addDayPlanItems, clearDayPlan } from "@/lib/dayPlan";
import { todayStr } from "@/lib/devtime";

const MIN_PER_UNIT = 20; // 粗估每个知识点约 20 分钟,用来把"每天能学多久"换算成每天几个单元
function addDays(ymd, n) { const [y, m, d] = String(ymd).split("-").map(Number); const t = new Date(y, m - 1, d); t.setDate(t.getDate() + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; }
function dow(ymd) { const [y, m, d] = String(ymd).split("-").map(Number); return new Date(y, m - 1, d).getDay(); } // 0=周日
function between(a, b) { const p = (x) => { const [y, m, d] = String(x).split("-").map(Number); return new Date(y, m - 1, d).getTime(); }; return Math.round((p(b) - p(a)) / 86400000); }

// opts: { mode:'deadline'|'until'|'weeks'|'open', examDate, targetDate, weeks, dailyMinutes, skipDays:[0..6], perDay, startDate, replace }
export function buildStudyTimetable(userId, exam, opts = {}) {
  const kps = leafKpList(exam.id);
  if (!kps.length) return { ok: false, note: "no_kps" };
  const units = kps.map((k) => ({ title: (k.chapter ? k.chapter + " · " : "") + k.title, kpId: k.id }));
  const skip = new Set((Array.isArray(opts.skipDays) ? opts.skipDays : []).map(Number));
  const start = opts.startDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.startDate) ? opts.startDate : todayStr();
  const perDayByMin = Math.max(1, Math.round((Number(opts.dailyMinutes) || 60) / MIN_PER_UNIT));

  // 目标结束日期(deadline/until/weeks 有;open 没有)
  let end = null;
  if (opts.mode === "deadline" && opts.examDate) end = opts.examDate;
  else if (opts.mode === "until" && opts.targetDate) end = opts.targetDate;
  else if (opts.mode === "weeks" && opts.weeks) end = addDays(start, Math.max(1, Number(opts.weeks)) * 7 - 1);

  // 收集学习日(跳过 skipDays);有 end 就收到 end,没 end 就先收一大批备用
  const studyDates = [];
  const cap = end ? Math.max(0, between(start, end)) + 1 : 400;
  for (let i = 0; i < cap; i++) { const d = addDays(start, i); if (!skip.has(dow(d))) studyDates.push(d); if (studyDates.length >= 400) break; }
  if (!studyDates.length) studyDates.push(start);

  let perDay;
  if (end) perDay = Math.max(1, Math.ceil(units.length / studyDates.length));       // 有期限:压进可用学习日
  else perDay = Math.max(1, Number(opts.perDay) || perDayByMin);                     // 无期限:按每天能学多久的节奏

  // 逐个学习日分配 units
  const items = [];
  let ui = 0;
  for (const date of studyDates) {
    if (ui >= units.length) break;
    for (let k = 0; k < perDay && ui < units.length; k++, ui++) items.push({ title: units[ui].title, date, kpId: units[ui].kpId, href: "/study" });
  }
  if (!items.length) return { ok: false, note: "empty" };
  const endDate = items[items.length - 1].date;
  const usedDays = new Set(items.map((x) => x.date)).size;

  addDayPlanItems(userId, { title: `${exam.name} · 学习进程`, items, replace: opts.replace !== false });
  return { ok: true, unitCount: units.length, perDay, startDate: start, endDate, usedStudyDays: usedDays, weeksApprox: Math.max(1, Math.ceil((between(start, endDate) + 1) / 7)), hadDeadline: !!end };
}
