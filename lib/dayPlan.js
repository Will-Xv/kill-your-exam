// 【跨考试按天排期】持久化的多天学习排期:未完成的自动顺延(不打乱后续顺序),可编辑,可让杀手重排。
// 存法:每个用户一份,放 settings(day_plan:<uid>)的 JSON。
import { getSetting, setSetting } from "@/lib/db";
import { todayStr } from "@/lib/devtime";

const KEY = (uid) => `day_plan:${uid}`;

function addDays(ymd, n) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function getDayPlan(userId) {
  try { const v = getSetting(KEY(userId), ""); return v ? JSON.parse(v) : null; } catch { return null; }
}
function save(userId, plan) { try { setSetting(KEY(userId), JSON.stringify(plan)); } catch {} }
export function clearDayPlan(userId) { try { setSetting(KEY(userId), ""); } catch {} }

// 杀手/用户重排:units 是【有序】的单元数组(由易到难/按天),每项 {title, examId?, taskId?, day?}。
// perDay:每天几项(day 没显式给时按顺序均摊)。startDate:第一天(默认今天)。
export function planDays(userId, { title, units, startDate, perDay } = {}) {
  const list = (Array.isArray(units) ? units : []).map((u) => (typeof u === "string" ? { title: u } : u)).filter((u) => u && (u.title != null));
  const pd = Math.max(1, Number(perDay) || 1);
  const start = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : todayStr();
  const items = list.map((u, i) => ({
    seq: i,
    day: Number.isFinite(Number(u.day)) ? Math.max(0, Math.floor(Number(u.day))) : Math.floor(i / pd),
    title: String(u.title).slice(0, 240),
    examId: u.examId != null ? Number(u.examId) : null,
    taskId: u.taskId != null ? Number(u.taskId) : null,
    done: false, doneAt: null,
  }));
  const plan = { title: String(title || "学习排期").slice(0, 120), startDate: start, perDay: pd, items, createdAt: Date.now() };
  save(userId, plan);
  return plan;
}

// 视图 + 顺延:未完成且【计划日<=今天】的全都堆到"现在该做"(含顺延),按原顺序;未来的按各自日期分组。
export function dayPlanView(userId, today) {
  const plan = getDayPlan(userId); if (!plan) return null;
  const t = today || todayStr();
  const items = (plan.items || []).map((it) => ({ ...it, date: addDays(plan.startDate, it.day || 0) }));
  const done = items.filter((i) => i.done).sort((a, b) => a.day - b.day || a.seq - b.seq);
  const todo = items.filter((i) => !i.done);
  const dueNow = todo.filter((i) => i.date <= t).sort((a, b) => a.day - b.day || a.seq - b.seq); // 含顺延(过期未完成)
  const overdueCount = dueNow.filter((i) => i.date < t).length;
  const futureMap = {};
  for (const i of todo.filter((i) => i.date > t)) (futureMap[i.date] = futureMap[i.date] || []).push(i);
  const future = Object.keys(futureMap).sort().map((date) => ({ date, items: futureMap[date].sort((a, b) => a.seq - b.seq) }));
  return { title: plan.title, startDate: plan.startDate, perDay: plan.perDay, today: t, dueNow, overdueCount, future, done, total: items.length, doneCount: done.length };
}

export function markDayItem(userId, seq, done = true) {
  const p = getDayPlan(userId); if (!p) return false;
  const it = (p.items || []).find((x) => Number(x.seq) === Number(seq)); if (!it) return false;
  it.done = !!done; it.doneAt = done ? Date.now() : null; save(userId, p); return true;
}

// 用户改排期:传新的 items 数组([{seq,day,title,examId,taskId,done}]),整体替换(用于删项/改标题/改在哪天/调顺序)。
export function editDayPlan(userId, items) {
  const p = getDayPlan(userId); if (!p) return false;
  p.items = (Array.isArray(items) ? items : []).map((u, i) => ({
    seq: Number.isFinite(Number(u.seq)) ? Number(u.seq) : i,
    day: Math.max(0, Math.floor(Number(u.day) || 0)),
    title: String(u.title || "").slice(0, 240),
    examId: u.examId != null ? Number(u.examId) : null,
    taskId: u.taskId != null ? Number(u.taskId) : null,
    done: !!u.done, doneAt: u.done ? (u.doneAt || Date.now()) : null,
  }));
  save(userId, p); return true;
}
