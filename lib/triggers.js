// 确定性触发引擎(第②步):真实代码里的钩子读取"已激活模式"的结构化触发器,满足条件就执行确定性动作。
// 现支持事件 answer(做题后):consecutive_wrong→difficulty_down、consecutive_correct→difficulty_up。
// 只在主人自己定义了对应触发器时才生效;没定义=行为不变(零回归)。
import db, { getSetting, setSetting } from "@/lib/db";
import { activeTriggers } from "@/lib/learningModes";

const dkey = (examId) => "difficulty_pref:" + examId;

// 当前难度档位(1易~3难);null=未设定,由 AI 自行判断
export function getDifficultyPref(examId) {
  const n = parseInt(getSetting(dkey(examId), ""), 10);
  return n >= 1 && n <= 3 ? n : null;
}
function setDifficultyPref(examId, level) { setSetting(dkey(examId), String(Math.max(1, Math.min(3, level)))); }

// 末尾连续【同结果】条数(correct=0 或 1)
function trailingStreak(examId, correct) {
  const rows = db.prepare("SELECT correct FROM attempts WHERE exam_id=? ORDER BY id DESC LIMIT 30").all(examId);
  let n = 0;
  for (const r of rows) { if (r.correct === correct) n++; else break; }
  return n;
}

// 做题后调用。返回触发到的动作数组(用于日志/回执),没触发返回 null。
export function onAnswer(userId, examId, { correct }) {
  let trigs;
  try { trigs = activeTriggers(userId, examId).filter((t) => t && t.event === "answer"); } catch { return null; }
  if (!trigs || !trigs.length) return null;
  const applied = [];
  for (const t of trigs) {
    const n = Math.max(1, parseInt(t.n, 10) || 2);
    if (t.when === "consecutive_wrong" && !correct && t.action === "difficulty_down") {
      if (trailingStreak(examId, 0) >= n) { const cur = getDifficultyPref(examId) || 2; if (cur > 1) { setDifficultyPref(examId, cur - 1); applied.push({ action: "difficulty_down", to: cur - 1 }); } }
    } else if (t.when === "consecutive_correct" && correct && t.action === "difficulty_up") {
      if (trailingStreak(examId, 1) >= n) { const cur = getDifficultyPref(examId) || 2; if (cur < 3) { setDifficultyPref(examId, cur + 1); applied.push({ action: "difficulty_up", to: cur + 1 }); } }
    }
  }
  return applied.length ? applied : null;
}
