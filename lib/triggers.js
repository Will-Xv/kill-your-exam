// 确定性触发引擎(第②步)。真实代码钩子读取"已激活模式"的结构化触发器,满足条件就执行确定性动作。
// 【所有阈值都是参数(n/window/pct/step/level/day...),对任意取值通用】——杀手按主人说的数字填,引擎不写死。
// 只在主人自己定义了对应触发器时才生效;没定义=行为不变(零回归)。全程 dev 门控(在调用方)。
import db, { getSetting, setSetting } from "@/lib/db";
import { getDifficultyPref, setDifficultyPref, clearDifficultyPref } from "@/lib/difficultyPref";
import { activeTriggers } from "@/lib/learningModes";
import { addFact } from "@/lib/memory";
import { kpMasteryLevel, updateReviewQueue, dueReviewCount } from "@/lib/mastery";
import { sendLetter } from "@/lib/inbox";

const MASTERY_RANK = { unlearned: 0, weak: 1, ok: 2, mastered: 3 };
function kpTitleOf(kpId) { if (!kpId) return ""; try { return db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(kpId)?.title || ""; } catch { return ""; } }
function trailingStreak(examId, correct) { const rows = db.prepare("SELECT correct FROM attempts WHERE exam_id=? ORDER BY id DESC LIMIT 50").all(examId); let n = 0; for (const r of rows) { if (r.correct === correct) n++; else break; } return n; }
function kpTrailingWrong(kpId) { if (!kpId) return 0; const rows = db.prepare("SELECT correct FROM attempts WHERE kp_id=? ORDER BY id DESC LIMIT 30").all(kpId); let n = 0; for (const r of rows) { if (r.correct === 0) n++; else break; } return n; }
function recentAccuracy(examId, window) { const rows = db.prepare("SELECT correct FROM attempts WHERE exam_id=? ORDER BY id DESC LIMIT ?").all(examId, Math.max(1, window)); if (rows.length < window) return null; return rows.filter((r) => r.correct === 1).length / rows.length; }
function attemptCount(examId) { try { return db.prepare("SELECT COUNT(*) c FROM attempts WHERE exam_id=?").get(examId).c; } catch { return 0; } }

function doDifficulty(examId, action, step, applied) {
  const cur = getDifficultyPref(examId) || 2; let next = cur;
  if (action === "difficulty_down") next = cur - (step || 1);
  else if (action === "difficulty_up") next = cur + (step || 1);
  else if (action === "difficulty_min") next = 1;
  else if (action === "difficulty_max") next = 3;
  next = Math.max(1, Math.min(3, next));
  if (next !== cur) { setDifficultyPref(examId, next); applied.push({ action, to: next }); }
}
function doNote(userId, examId, kpId, t, applied) {
  try { const kt = kpTitleOf(kpId); addFact(userId, examId, { subject: kt || "练习", kind: "observation", claim: (t.text && String(t.text).slice(0, 200)) || `${t.action === "flag_review" ? "触发复习" : "触发提醒"}${kt ? "(" + kt + ")" : ""}`, valence: t.action === "flag_review" ? "weak" : "neutral", scope: "exam" }); applied.push({ action: t.action, kp: kt || null }); } catch {}
}
function doNotify(userId, t, applied) { try { sendLetter(userId, { title: (t.title && String(t.title).slice(0, 80)) || "杀手提醒", body: (t.text && String(t.text).slice(0, 600)) || "" }); applied.push({ action: "notify" }); } catch {} }
function runAction(userId, examId, kpId, questionId, t, applied) {
  const a = t.action || "";
  if (/^difficulty_/.test(a)) doDifficulty(examId, a, Math.max(1, parseInt(t.step, 10) || 1), applied);
  else if (a === "note" || a === "flag_review") doNote(userId, examId, kpId, t, applied);
  else if (a === "notify") doNotify(userId, t, applied);
  else if (a === "insert_review") { if (questionId) { try { updateReviewQueue(questionId, false); applied.push({ action: "insert_review", kp: kpTitleOf(kpId) || null }); } catch {} } }
}

// —— 做题后(event: answer)——
export function onAnswer(userId, examId, { correct, kpId, questionId }) {
  let trigs;
  try { trigs = activeTriggers(userId, examId).filter((t) => t && t.event === "answer"); } catch { return null; }
  const hasDiffTrig = trigs && trigs.some((t) => /^difficulty_/.test(t.action || ""));
  if (!hasDiffTrig && getDifficultyPref(examId) != null) { clearDifficultyPref(examId); if (!trigs || !trigs.length) return [{ action: "difficulty_reset" }]; }
  if (!trigs || !trigs.length) return null;
  const applied = [];
  for (const t of trigs) {
    const n = Math.max(1, parseInt(t.n, 10) || 2);
    let hit = false;
    if (t.when === "consecutive_wrong") hit = !correct && trailingStreak(examId, 0) >= n;
    else if (t.when === "consecutive_correct") hit = correct && trailingStreak(examId, 1) >= n;
    else if (t.when === "kp_consecutive_wrong") hit = !correct && kpTrailingWrong(kpId) >= n;
    else if (t.when === "accuracy_below") { const w = Math.max(1, parseInt(t.window, 10) || 5); const acc = recentAccuracy(examId, w); hit = acc != null && acc < ((parseFloat(t.pct) || 60) / 100); }
    else if (t.when === "mastery_below") { const lvl = kpId ? kpMasteryLevel(kpId) : null; hit = lvl != null && MASTERY_RANK[lvl] < (MASTERY_RANK[t.level] ?? 2); }
    else if (t.when === "every") { const c = attemptCount(examId); hit = c > 0 && c % n === 0; }
    if (hit) runAction(userId, examId, kpId, questionId, t, applied);
  }
  return applied.length ? applied : null;
}

// —— 会话/每日/每周(event: session),由 /api/triggers/tick 在打开应用时触发 ——
export function onSession(userId, examId) {
  let trigs;
  try { trigs = activeTriggers(userId, examId).filter((t) => t && t.event === "session"); } catch { return null; }
  if (!trigs || !trigs.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const dow = new Date().getDay();
  const applied = [];
  for (const t of trigs) {
    let hit = false;
    if (t.when === "daily_first") { if (getSetting("trig_daily:" + examId, "") !== today) { setSetting("trig_daily:" + examId, today); hit = true; } }
    else if (t.when === "weekly") { const day = parseInt(t.day, 10); if (dow === day && getSetting("trig_weekly:" + examId + ":" + day, "") !== today) { setSetting("trig_weekly:" + examId + ":" + day, today); hit = true; } }
    else if (t.when === "due_reviews_at_least") { hit = dueReviewCount(examId) >= Math.max(1, parseInt(t.n, 10) || 1); }
    else if (t.when === "idle_days") { const last = db.prepare("SELECT MAX(created_at) m FROM attempts WHERE exam_id=?").get(examId)?.m; if (last) { const days = (Date.now() - new Date(last.replace(" ", "T") + "Z").getTime()) / 86400000; hit = days >= (parseInt(t.n, 10) || 3); } }
    if (hit) runAction(userId, examId, null, null, t, applied);
  }
  return applied.length ? applied : null;
}
