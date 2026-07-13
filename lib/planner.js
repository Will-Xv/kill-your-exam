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
  try {
    return db.prepare("SELECT id,name,exam_date,daily_minutes FROM exams WHERE user_id=? AND parent_id IS NULL AND (status IS NULL OR status='active') AND deleted_at IS NULL ORDER BY id").all(userId);
  } catch { return db.prepare("SELECT id,name,exam_date,daily_minutes FROM exams WHERE user_id=? AND parent_id IS NULL ORDER BY id").all(userId); }
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
      score: +score.toFixed(2), weakTitles: s.weak.slice(0, 3) });
  }
  const total = totalMinutes || rows.reduce((a, r) => a + (r.dailyMinutes || 0), 0) || 90;
  for (const r of rows) r.allocMinutes = sumScore > 0 ? Math.round(total * r.score / sumScore) : Math.round(total / (rows.length || 1));
  rows.sort((a, b) => b.score - a.score);
  const top = rows[0];
  const topTask = !top ? null
    : top.due > 0 ? { examId: top.id, exam: top.name, action: "review", text: `复习「${top.name}」到期的 ${top.due} 道题`, minutes: Math.min(top.allocMinutes, 25) }
    : top.weakTitles.length ? { examId: top.id, exam: top.name, action: "weak", text: `攻「${top.name}」的薄弱点:${top.weakTitles[0]}`, minutes: Math.min(top.allocMinutes, 30) }
    : { examId: top.id, exam: top.name, action: "practice", text: `练一练「${top.name}」`, minutes: Math.min(top.allocMinutes, 20) };
  return { exams: rows, totalMinutes: total, topTask, examCount: rows.length };
}
