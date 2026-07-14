// 类4 计划版本对比:①每周给跨考试计划存一份快照,支持「本周 vs 上周」对比;②保守/激进双版本(共用错题本)。
import db from "@/lib/db";
import { crossExamPlan, planVariants } from "@/lib/planner";

// ISO 周键,如 2026-W28。
export function weekKey(d = new Date()) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

// 把跨考试计划的关键指标压扁,便于对比。
function snapMetrics(plan) {
  const exams = (plan.exams || []).map((e) => ({ id: e.id, name: e.name, allocMinutes: e.allocMinutes, weak: e.weak, unlearned: e.unlearned, due: e.due, daysLeft: e.daysLeft }));
  return { totalMinutes: plan.totalMinutes, examCount: exams.length, exams,
    totalWeak: exams.reduce((a, e) => a + (e.weak || 0), 0),
    totalUnlearned: exams.reduce((a, e) => a + (e.unlearned || 0), 0),
    totalDue: exams.reduce((a, e) => a + (e.due || 0), 0) };
}

// 存本周快照(每周每人一条,当周内更新为最新)。
export function snapshotThisWeek(userId) {
  const plan = crossExamPlan(userId, {});
  const m = snapMetrics(plan);
  const wk = weekKey();
  try {
    db.prepare(`INSERT INTO plan_snapshots(user_id,week_key,plan_json,created_at) VALUES(?,?,?,datetime('now'))
      ON CONFLICT(user_id,week_key) DO UPDATE SET plan_json=excluded.plan_json, created_at=datetime('now')`).run(userId, wk, JSON.stringify(m));
  } catch {}
  return { weekKey: wk, metrics: m };
}

function prevSnapshot(userId, curWeek) {
  try {
    return db.prepare("SELECT week_key, plan_json FROM plan_snapshots WHERE user_id=? AND week_key<>? ORDER BY id DESC LIMIT 1").get(userId, curWeek);
  } catch { return null; }
}

// 本周 vs 上一份快照的对比。
export function compareWeeks(userId) {
  const cur = snapshotThisWeek(userId);
  const prevRow = prevSnapshot(userId, cur.weekKey);
  if (!prevRow) return { thisWeek: cur, lastWeek: null };
  let prev; try { prev = JSON.parse(prevRow.plan_json); } catch { prev = null; }
  if (!prev) return { thisWeek: cur, lastWeek: null };
  const c = cur.metrics;
  const diff = {
    weak: c.totalWeak - prev.totalWeak,
    unlearned: c.totalUnlearned - prev.totalUnlearned,
    due: c.totalDue - prev.totalDue,
    totalMinutes: c.totalMinutes - prev.totalMinutes,
    examCount: c.examCount - prev.examCount,
  };
  // 每门考试的薄弱/未学变化
  const prevById = new Map((prev.exams || []).map((e) => [e.id, e]));
  const perExam = (c.exams || []).map((e) => {
    const p = prevById.get(e.id);
    return { name: e.name, weakDelta: p ? e.weak - p.weak : null, unlearnedDelta: p ? e.unlearned - p.unlearned : null, minutesDelta: p ? e.allocMinutes - p.allocMinutes : null, isNew: !p };
  });
  return { thisWeek: cur, lastWeek: { weekKey: prevRow.week_key, metrics: prev }, diff, perExam };
}

export function getPlanVariants(userId) {
  return planVariants(userId, {});
}
