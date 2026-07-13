// 确定性触发引擎(第②步)。真实代码钩子读取"已激活模式"的结构化触发器,满足条件就执行确定性动作。
// 【所有阈值都是参数(n / window / pct / step),对任意取值通用】——杀手按主人说的数字填,引擎不写死。
// 只在主人自己定义了对应触发器时才生效;没定义=行为不变(零回归)。
import db from "@/lib/db";
import { getDifficultyPref, setDifficultyPref, clearDifficultyPref } from "@/lib/difficultyPref";
import { activeTriggers } from "@/lib/learningModes";
import { addFact } from "@/lib/memory";

function kpTitleOf(kpId) { if (!kpId) return ""; try { return db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(kpId)?.title || ""; } catch { return ""; } }

// 末尾连续【同结果】条数
function trailingStreak(examId, correct) {
  const rows = db.prepare("SELECT correct FROM attempts WHERE exam_id=? ORDER BY id DESC LIMIT 50").all(examId);
  let n = 0; for (const r of rows) { if (r.correct === correct) n++; else break; } return n;
}
// 最近 window 次的正确率(0~1);不足 window 次返回 null(样本太少不触发)
function recentAccuracy(examId, window) {
  const rows = db.prepare("SELECT correct FROM attempts WHERE exam_id=? ORDER BY id DESC LIMIT ?").all(examId, Math.max(1, window));
  if (rows.length < window) return null;
  return rows.filter((r) => r.correct === 1).length / rows.length;
}
function attemptCount(examId) { try { return db.prepare("SELECT COUNT(*) c FROM attempts WHERE exam_id=?").get(examId).c; } catch { return 0; } }

// 做题后调用。返回触发到的动作(用于回执/日志),没触发返回 null。
export function onAnswer(userId, examId, { correct, kpId }) {
  let trigs;
  try { trigs = activeTriggers(userId, examId).filter((t) => t && t.event === "answer"); } catch { return null; }
  const hasDiffTrig = trigs && trigs.some((t) => /^difficulty_/.test(t.action || ""));
  if (!hasDiffTrig) { // 没有难度触发器(模式被删/停用)-> 自动复位难度档位
    if (getDifficultyPref(examId) != null) { clearDifficultyPref(examId); return [{ action: "difficulty_reset" }]; }
    if (!trigs || !trigs.length) return null;
  }

  const applied = [];
  const doDifficulty = (action, step) => {
    const cur = getDifficultyPref(examId) || 2;
    let next = cur;
    if (action === "difficulty_down") next = cur - (step || 1);
    else if (action === "difficulty_up") next = cur + (step || 1);
    else if (action === "difficulty_min") next = 1;
    else if (action === "difficulty_max") next = 3;
    next = Math.max(1, Math.min(3, next));
    if (next !== cur) { setDifficultyPref(examId, next); applied.push({ action, to: next }); }
  };
  const doNote = (t, tag) => {
    try {
      const kt = kpTitleOf(kpId);
      addFact(userId, examId, { subject: kt || "练习", kind: "observation",
        claim: (t.text && String(t.text).slice(0, 200)) || `${tag}${kt ? "(" + kt + ")" : ""}`,
        valence: t.action === "flag_review" ? "weak" : "neutral", scope: "exam" });
      applied.push({ action: t.action, kp: kt || null });
    } catch {}
  };

  for (const t of trigs) {
    const n = Math.max(1, parseInt(t.n, 10) || 2);
    let hit = false;
    if (t.when === "consecutive_wrong") hit = !correct && trailingStreak(examId, 0) >= n;
    else if (t.when === "consecutive_correct") hit = correct && trailingStreak(examId, 1) >= n;
    else if (t.when === "accuracy_below") { const w = Math.max(1, parseInt(t.window, 10) || 5); const acc = recentAccuracy(examId, w); hit = acc != null && acc < ((parseFloat(t.pct) || 60) / 100); }
    else if (t.when === "every") { const c = attemptCount(examId); hit = c > 0 && c % n === 0; }
    if (!hit) continue;

    const a = t.action || "";
    if (/^difficulty_/.test(a)) doDifficulty(a, Math.max(1, parseInt(t.step, 10) || 1));
    else if (a === "note" || a === "flag_review") doNote(t, a === "flag_review" ? "触发复习" : "触发提醒");
  }
  return applied.length ? applied : null;
}
