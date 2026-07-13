// 确定性触发引擎(第②步)。真实代码钩子读取"已激活模式"的结构化触发器,满足条件就执行确定性动作。
// 【所有阈值都是参数(n/window/pct/step/level/day...),对任意取值通用】——杀手按主人说的数字填,引擎不写死。
// 只在主人自己定义了对应触发器时才生效;没定义=行为不变(零回归)。全程 dev 门控(在调用方)。
import db, { getSetting, setSetting, familyScope, scopeSql } from "@/lib/db";
import { getDifficultyPref, setDifficultyPref, clearDifficultyPref } from "@/lib/difficultyPref";
import { activeTriggers } from "@/lib/learningModes";
import { addFact } from "@/lib/memory";
import { kpMasteryLevel, updateReviewQueue, dueReviewCount } from "@/lib/mastery";
import { sendLetter } from "@/lib/inbox";
import { notifyUser } from "@/lib/notify";

const MASTERY_RANK = { unlearned: 0, weak: 1, ok: 2, mastered: 3 };
function onceToday(key, today) { const k = "trig_once:" + key; if (getSetting(k, "") === today) return false; setSetting(k, today); return true; }
function kpTitleOf(kpId) { if (!kpId) return ""; try { return db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(kpId)?.title || ""; } catch { return ""; } }
function trailingStreak(examId, correct) { const rows = db.prepare("SELECT correct FROM attempts WHERE exam_id=? ORDER BY id DESC LIMIT 50").all(examId); let n = 0; for (const r of rows) { if (r.correct === correct) n++; else break; } return n; }
function kpTrailingWrong(kpId) { if (!kpId) return 0; const rows = db.prepare("SELECT correct FROM attempts WHERE kp_id=? ORDER BY id DESC LIMIT 30").all(kpId); let n = 0; for (const r of rows) { if (r.correct === 0) n++; else break; } return n; }
function recentAccuracy(examId, window) { const rows = db.prepare("SELECT correct FROM attempts WHERE exam_id=? ORDER BY id DESC LIMIT ?").all(examId, Math.max(1, window)); if (rows.length < window) return null; return rows.filter((r) => r.correct === 1).length / rows.length; }
function hasRecentSelfClaim(userId, examId, days) { try { return db.prepare(`SELECT COUNT(*) c FROM memory_facts WHERE user_id=? AND kind='self_assessment' AND active=1 AND created_at >= datetime('now','-'||?||' day') AND (exam_id IN ${scopeSql(familyScope(examId))} OR exam_id IS NULL)`).get(userId, Math.max(1, days || 3)).c > 0; } catch { return false; } }
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
function doNotify(userId, t, applied, pending) {
  const title = (t.title && String(t.title).slice(0, 80)) || "杀手提醒";
  const body = (t.text && String(t.text).slice(0, 600)) || "";
  try { sendLetter(userId, { title, body }); } catch {} // 站内信一定发
  try { pending.push(notifyUser(userId, "push", { title, body, url: "/inbox" }).then((r) => r).catch(() => null)); } catch {} // 开了通知才推送到应用外
  applied.push({ action: "notify" });
}
function runAction(userId, examId, kpId, questionId, t, applied, pending) {
  const a = t.action || "";
  if (/^difficulty_/.test(a)) doDifficulty(examId, a, Math.max(1, parseInt(t.step, 10) || 1), applied);
  else if (a === "note" || a === "flag_review") doNote(userId, examId, kpId, t, applied);
  else if (a === "notify") doNotify(userId, t, applied, pending);
  else if (a === "insert_review") { if (questionId) { try { updateReviewQueue(questionId, false); applied.push({ action: "insert_review", kp: kpTitleOf(kpId) || null }); } catch {} } }
  else if (a === "distrust_self") {
    try {
      const n = db.prepare(`UPDATE memory_facts SET weight = MAX(0.2, COALESCE(weight,1.0)*0.4) WHERE user_id=? AND kind='self_assessment' AND active=1 AND created_at >= datetime('now','-7 day') AND (exam_id IN ${scopeSql(familyScope(examId))} OR exam_id IS NULL)`).run(userId).changes;
      addFact(userId, examId, { subject: kpTitleOf(kpId) || "自评校准", kind: "observation", claim: "验证优先:说懂了/自认掌握,但验证题做错——自评权重下调,以做题数据为准", valence: "weak", scope: "exam" });
      applied.push({ action: "distrust_self", downweighted: n });
    } catch {}
  }
}

// —— 做题后(event: answer)——
export async function onAnswer(userId, examId, { correct, kpId, questionId }) {
  let trigs;
  try { trigs = activeTriggers(userId, examId).filter((t) => t && t.event === "answer"); } catch { return null; }
  const hasDiffTrig = trigs && trigs.some((t) => /^difficulty_/.test(t.action || ""));
  if (!hasDiffTrig && getDifficultyPref(examId) != null) { clearDifficultyPref(examId); if (!trigs || !trigs.length) return [{ action: "difficulty_reset" }]; }
  if (!trigs || !trigs.length) return null;
  const applied = [], pending = [];
  for (const t of trigs) {
    const n = Math.max(1, parseInt(t.n, 10) || 2);
    let hit = false;
    if (t.when === "consecutive_wrong") hit = !correct && trailingStreak(examId, 0) >= n;
    else if (t.when === "consecutive_correct") hit = correct && trailingStreak(examId, 1) >= n;
    else if (t.when === "kp_consecutive_wrong") hit = !correct && kpTrailingWrong(kpId) >= n;
    else if (t.when === "accuracy_below") { const w = Math.max(1, parseInt(t.window, 10) || 5); const acc = recentAccuracy(examId, w); hit = acc != null && acc < ((parseFloat(t.pct) || 60) / 100); }
    else if (t.when === "mastery_below") { const lvl = kpId ? kpMasteryLevel(kpId) : null; hit = lvl != null && MASTERY_RANK[lvl] < (MASTERY_RANK[t.level] ?? 2); }
    else if (t.when === "every") { const c = attemptCount(examId); hit = c > 0 && c % n === 0; }
    else if (t.when === "wrong_after_claim") { hit = !correct && hasRecentSelfClaim(userId, examId, parseInt(t.days, 10) || 3); }
    if (hit) runAction(userId, examId, kpId, questionId, t, applied, pending);
  }
  try { await Promise.allSettled(pending); } catch {}
  return applied.length ? applied : null;
}

// —— 会话/每日/每周(event: session),由 /api/triggers/tick 在打开应用时触发 ——
export async function onSession(userId, examId) {
  let trigs;
  try { trigs = activeTriggers(userId, examId).filter((t) => t && t.event === "session"); } catch { return null; }
  if (!trigs || !trigs.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const dow = new Date().getDay();
  const applied = [], pending = [];
  for (const t of trigs) {
    let hit = false;
    if (t.when === "daily_first") { if (getSetting("trig_daily:" + examId, "") !== today) { setSetting("trig_daily:" + examId, today); hit = true; } }
    else if (t.when === "weekly") { const day = parseInt(t.day, 10); if (dow === day && getSetting("trig_weekly:" + examId + ":" + day, "") !== today) { setSetting("trig_weekly:" + examId + ":" + day, today); hit = true; } }
    else if (t.when === "due_reviews_at_least") { hit = dueReviewCount(examId) >= Math.max(1, parseInt(t.n, 10) || 1) && onceToday("due:" + examId + ":" + (t.n || 1), today); }
    else if (t.when === "idle_days") { const last = db.prepare("SELECT MAX(created_at) m FROM attempts WHERE exam_id=?").get(examId)?.m; if (last) { const days = (Date.now() - new Date(last.replace(" ", "T") + "Z").getTime()) / 86400000; hit = days >= (parseInt(t.n, 10) || 3) && onceToday("idle:" + examId, today); } }
    if (hit) runAction(userId, examId, null, null, t, applied, pending);
  }
  try { await Promise.allSettled(pending); } catch {}
  return applied.length ? applied : null;
}
