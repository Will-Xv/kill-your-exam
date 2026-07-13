// 跨考试自适应规划器:把用户所有考试按 紧迫度(考试日期)× 提分空间(薄弱/未学)× 遗忘(到期复习)算优先级,
// 动态分配每天时间,并给出"今天最该做的一件事"。类1/3/7/13/17 的地基。
import db from "@/lib/db";
import { examSummary, dueReviewCount } from "@/lib/mastery";

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(String(dateStr).slice(0, 10) + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t0.getTime()) / 86400000);
}

function listTopExams(userId) {
  // 顶层考试(parent_exam_id IS NULL);子考试由 examSummary 家族聚合。排除已删+未建完(setup_state=draft/generating)。
  const q = (extra) => { try { return db.prepare("SELECT id,name,exam_date,daily_minutes,parent_exam_id FROM exams WHERE user_id=? AND deleted_at IS NULL" + extra + " ORDER BY id").all(userId); } catch { return null; } };
  let rows = q(" AND parent_exam_id IS NULL AND completed_at IS NULL AND (setup_state IS NULL OR setup_state NOT IN ('draft','generating'))");
  if (rows == null) rows = q(" AND parent_exam_id IS NULL");   // 老库可能没 setup_state
  if (rows == null || rows.length === 0) rows = q("") || [];   // 再退一步:该用户全部未删考试
  return rows;
}

export function crossExamPlan(userId, { totalMinutes, mode } = {}) {
  const exams = listTopExams(userId);
  const rows = [];
  let sumScore = 0;
  for (const ex of exams) {
    let s; try { s = examSummary(ex.id); } catch { s = { kpTotal: 0, weak: [], mastered: [], accuracy: 0 }; }
    const due = (() => { try { return dueReviewCount(ex.id); } catch { return 0; } })();
    const daysLeft = daysUntil(ex.exam_date);
    const weakN = s.weak.length;
    const unlearnedN = Math.max(0, s.kpTotal - weakN - s.mastered.length);
    const gap = s.kpTotal ? (weakN + unlearnedN) / s.kpTotal : 0.5;            // 提分空间 0~1
    const urgency = daysLeft == null ? 1 : Math.max(0.2, Math.min(5, 21 / (Math.max(0, daysLeft) + 1))); // 越近越大
    const dueW = Math.min(2, due / 10);
    let score = urgency * (0.5 + gap) + dueW * 0.5;
    if (mode === "sprint" && daysLeft != null && daysLeft <= 3) score *= 2;   // 急救/冲刺:临考考试再加权
    sumScore += score;
    rows.push({ id: ex.id, name: ex.name, examDate: ex.exam_date || null, daysLeft, dailyMinutes: ex.daily_minutes || 60,
      kpTotal: s.kpTotal, weak: weakN, unlearned: unlearnedN, mastered: s.mastered.length, accuracy: s.accuracy, due,
      score: +score.toFixed(2), weakTitles: s.weak.slice(0, 3), weakKps: s.weakKps || [] });
  }
  const total = totalMinutes || rows.reduce((a, r) => a + (r.dailyMinutes || 0), 0) || 90;
  for (const r of rows) r.allocMinutes = sumScore > 0 ? Math.round(total * r.score / sumScore) : Math.round(total / (rows.length || 1));
  const sprint = mode === "sprint";
  for (const r of rows) {
    const tasks = []; let left = Math.max(10, r.allocMinutes);
    if (r.due > 0) { const m = Math.min(left, sprint ? Math.round(left * 0.5) : 15); tasks.push({ type: "review", label: `复习到期的 ${r.due} 道题`, count: r.due, minutes: m, href: "/practice?mode=review" }); left -= m; }
    for (const kp of (r.weakKps || []).slice(0, sprint ? 2 : 3)) { if (left <= 6) break; const m = Math.min(left, 15); tasks.push({ type: "kp", title: kp.title, kpId: kp.id, minutes: m, href: `/practice?kp=${kp.id}` }); left -= m; }
    if (!sprint && left >= 8) tasks.push({ type: "free", label: "自由练习一组", minutes: left, href: "/practice?fresh=1" }); // 冲刺模式不铺新题,只巩固
    r.tasks = tasks;
  }
  rows.sort((a, b) => b.score - a.score);
  const top = rows[0];
  const topTask = !top ? null
    : top.due > 0 ? { examId: top.id, exam: top.name, action: "review", count: top.due, text: `复习「${top.name}」到期的 ${top.due} 道题`, minutes: Math.min(top.allocMinutes, 25) }
    : top.weakTitles.length ? { examId: top.id, exam: top.name, action: "weak", title: top.weakTitles[0], text: `攻「${top.name}」的薄弱点:${top.weakTitles[0]}`, minutes: Math.min(top.allocMinutes, 30) }
    : { examId: top.id, exam: top.name, action: "practice", text: `练一练「${top.name}」`, minutes: Math.min(top.allocMinutes, 20) };
  return { exams: rows, totalMinutes: total, topTask, examCount: rows.length };
}
