import db, { examScope, scopeSql } from "./db";

export const LEVELS = { unlearned: "未学", weak: "薄弱", ok: "一般", mastered: "掌握" };
const INTERVALS = [1, 3, 7, 15, 30]; // 间隔重复天数

// 每个叶子知识点的掌握度(规则计算,近期作答权重更高)
export function masteryMatrix(examId) {
  const _sc = scopeSql(examScope(examId));
  const kps = db.prepare(`SELECT kp.*, ch.title chapter FROM knowledge_points kp
    LEFT JOIN knowledge_points ch ON ch.id = kp.parent_id
    WHERE kp.exam_id IN ${_sc} AND kp.parent_id IS NOT NULL ORDER BY ch.sort, kp.sort`).all();
  const rows = db.prepare(`SELECT kp_id, correct, created_at FROM attempts
    WHERE exam_id IN ${_sc} AND mode != 'resolved' AND kp_id IS NOT NULL`).all();
  const byKp = {};
  for (const r of rows) (byKp[r.kp_id] ||= []).push(r);
  // 争论/追问沉淀的观察也算作掌握度证据(理解=正面、薄弱=负面),权重比一道题略轻、同样按新旧衰减。
  // 这样"争论的结果"会真正改变熟悉程度,而不只是显示一段话。
  const INSIGHT_W = 0.6;
  const insByKp = {};
  try {
    const ins = db.prepare(`SELECT kp_id, kind, created_at FROM insights
      WHERE exam_id IN ${_sc} AND kp_id IS NOT NULL AND kind IN ('understanding','gap','misconception')`).all();
    for (const r of ins) (insByKp[r.kp_id] ||= []).push(r);
  } catch {}
  return kps.map((kp) => {
    const arr = byKp[kp.id] || [];
    let wSum = 0, wCorrect = 0;
    for (const a of arr) {
      const days = (Date.now() - new Date(a.created_at + "Z").getTime()) / 86400000;
      const w = Math.exp(-Math.max(0, days) / 14);
      wSum += w; wCorrect += w * (a.correct ? 1 : 0);
    }
    const insArr = insByKp[kp.id] || [];
    let insCount = 0;
    for (const it of insArr) {
      // 没做过题的知识点默认就是"未学"(灰),别因为在别处暴露的薄弱把它标红——只允许"理解"把它变绿。
      if (arr.length === 0 && it.kind === "gap") continue;
      const days = (Date.now() - new Date(it.created_at + "Z").getTime()) / 86400000;
      const w = INSIGHT_W * Math.exp(-Math.max(0, days) / 14);
      wSum += w; wCorrect += w * (it.kind === "understanding" ? 1 : 0); insCount++;
    }
    const acc = wSum ? wCorrect / wSum : 0;
    const evidence = arr.length + insCount;
    let level = "unlearned";
    if (evidence > 0) level = acc < 0.6 ? "weak" : acc < 0.85 || evidence < 3 ? "ok" : "mastered";
    return { ...kp, attempts: arr.length, insights: insArr.length, accuracy: Math.round(acc * 100), level };
  });
}

// 单个知识点的当前掌握度等级(与 masteryMatrix 同一套规则,供“做题→记忆”即时判定)
export function kpMasteryLevel(kpId) {
  const arr = db.prepare("SELECT correct, created_at FROM attempts WHERE kp_id=? AND mode!='resolved'").all(Number(kpId));
  let wSum = 0, wCorrect = 0;
  for (const a of arr) { const days = (Date.now() - new Date((a.created_at || "").replace(" ", "T") + "Z").getTime()) / 86400000; const w = Math.exp(-Math.max(0, days) / 14); wSum += w; wCorrect += w * (a.correct ? 1 : 0); }
  let insCount = 0;
  try { const ins = db.prepare("SELECT kind FROM insights WHERE kp_id=? AND kind IN ('understanding','misconception')").all(Number(kpId)); insCount = ins.length; for (const it of ins) { wSum += 0.6; wCorrect += 0.6 * (it.kind === 'understanding' ? 1 : 0); } } catch {}
  const evidence = arr.length + insCount;
  if (evidence <= 0) return "unlearned";
  const acc = wSum ? wCorrect / wSum : 0;
  return acc < 0.6 ? "weak" : (acc < 0.85 || evidence < 3) ? "ok" : "mastered";
}

// 答题后维护间隔重复队列
export function updateReviewQueue(questionId, correct) {
  const row = db.prepare("SELECT * FROM review_queue WHERE question_id=?").get(questionId);
  if (!correct) {
    if (row) db.prepare("UPDATE review_queue SET interval_level=0, due_date=date('now','localtime','+1 day') WHERE id=?").run(row.id);
    else db.prepare("INSERT INTO review_queue(question_id, due_date, interval_level) VALUES(?, date('now','localtime','+1 day'), 0)").run(questionId);
    return;
  }
  if (!row) return;
  const lvl = row.interval_level + 1;
  if (lvl >= INTERVALS.length) db.prepare("DELETE FROM review_queue WHERE id=?").run(row.id);
  else db.prepare(`UPDATE review_queue SET interval_level=?, due_date=date('now','localtime','+${INTERVALS[lvl]} day') WHERE id=?`).run(lvl, row.id);
}

// 合并作答后重算遗忘曲线:按该题【合并后的作答时间线】重放间隔重复,得出当前间隔级别与到期日,覆盖 review_queue。
export function recomputeReviewFromAttempts(questionId) {
  const qid = Number(questionId);
  const atts = db.prepare("SELECT correct, created_at FROM attempts WHERE question_id=? ORDER BY datetime(created_at) ASC, id ASC").all(qid);
  if (!atts.length) return;
  let level = 0, mastered = false;
  for (const a of atts) {
    if (!a.correct) { level = 0; mastered = false; }
    else { level = level + 1; if (level >= INTERVALS.length) { mastered = true; break; } }
  }
  const lastAt = atts[atts.length - 1].created_at;
  db.prepare("DELETE FROM review_queue WHERE question_id=?").run(qid);
  if (mastered) return; // 已走完全部间隔,不再排复习
  const lvl = Math.max(0, Math.min(INTERVALS.length - 1, level));
  db.prepare(`INSERT INTO review_queue(question_id, due_date, interval_level) VALUES(?, date(?, '+' || ? || ' day'), ?)`).run(qid, (lastAt || "now"), INTERVALS[lvl], lvl);
}

export function dueReviewCount(examId) {
  return db.prepare(`SELECT COUNT(*) n FROM review_queue rq JOIN questions q ON q.id=rq.question_id
    WHERE q.exam_id IN ${scopeSql(examScope(examId))} AND q.flagged=0 AND rq.due_date <= date('now','localtime')`).get().n;
}

// 跨考试:某考试的整体统计(用于用户整体画像)
export function examSummary(examId) {
  const m = masteryMatrix(examId);
  const a = db.prepare(`SELECT COUNT(*) done, SUM(correct) hit,
      COUNT(DISTINCT date(created_at,'localtime')) days,
      MAX(created_at) last FROM attempts WHERE exam_id=? AND mode!='resolved'`).get(examId);
  const done = a.done || 0;
  const weak = m.filter((k) => k.level === "weak").map((k) => k.title);
  const mastered = m.filter((k) => k.level === "mastered").map((k) => k.title);
  return {
    done, activeDays: a.days || 0, lastActive: a.last,
    accuracy: done ? Math.round(((a.hit || 0) / done) * 100) : 0,
    kpTotal: m.length,
    weak, mastered,
    // 全部叶子知识点标题(用于跨考试重叠检测)
    kps: m.map((k) => ({ title: k.title, level: k.level, accuracy: k.accuracy })),
  };
}

// 归一化知识点标题,便于跨考试匹配重叠
function normTitle(t) {
  return String(t || "").toLowerCase().replace(/[\s\-_（）()【】\[\]·,、。:;]/g, "").trim();
}

// 找出在 >=2 个考试中都出现的知识点(可迁移能力)
export function overlapKps(perExam) {
  const map = {};
  for (const e of perExam) for (const k of e.kps) {
    const key = normTitle(k.title);
    if (!key) continue;
    (map[key] ||= []).push({ exam: e.name, title: k.title, level: k.level, accuracy: k.accuracy });
  }
  return Object.values(map).filter((arr) => new Set(arr.map((x) => x.exam)).size >= 2)
    .map((arr) => ({ title: arr[0].title, appears: arr }));
}


// 某考试的叶子知识点列表(id+标题),用于让 AI 在别的题里识别出对这些知识点的理解/薄弱
export function leafKpList(examId) {
  return db.prepare(`SELECT kp.id, kp.title, ch.title chapter FROM knowledge_points kp
    LEFT JOIN knowledge_points ch ON ch.id = kp.parent_id
    WHERE kp.exam_id=? AND kp.parent_id IS NOT NULL ORDER BY ch.sort, kp.sort`).all(examId);
}

// 记录"跨知识点"的理解/薄弱证据:比如在第三单元的题里体现出对第一单元的深刻理解(或不理解),
// 也据此改动第一单元的掌握度。crossKp: [{ kpId, kind:'understanding'|'gap', insight }]
// 返回真正落库的项(含标题),供前端提示"已更新〈X〉熟悉程度 ↑/↓"。
export function recordCrossKp(examId, questionId, crossKp, skipKpId) {
  if (!Array.isArray(crossKp) || !crossKp.length) return [];
  const valid = new Map(db.prepare("SELECT id, title FROM knowledge_points WHERE exam_id=?").all(examId).map((r) => [r.id, r.title]));
  const applied = [];
  const seen = new Set();
  for (const c of crossKp) {
    const kid = Number(c.kpId);
    if (!valid.has(kid) || kid === Number(skipKpId) || seen.has(kid)) continue;
    if (!["understanding", "gap", "misconception"].includes(c.kind)) continue;
    seen.add(kid);
    const defText = c.kind === "understanding" ? "在其它题的作答/讨论中体现出对该知识点的理解" : c.kind === "misconception" ? "在其它题的作答/讨论中体现出对该知识点的错误理解" : "在其它题的作答/讨论中暴露出对该知识点的薄弱";
    const text = (String(c.insight || "").trim() || defText).slice(0, 300);
    try {
      db.prepare("INSERT INTO insights(exam_id,kp_id,question_id,kind,text) VALUES(?,?,?,?,?)").run(examId, kid, questionId || null, c.kind, text);
      applied.push({ kpId: kid, title: valid.get(kid), kind: c.kind });
    } catch {}
  }
  return applied;
}

// ——— 知识状态 + 记忆曲线的实时摘要(喂进杀手上下文)。带 45s 缓存,避免每次对话重算(不阻塞)。———
const _KS_CACHE = new Map(); // examId -> { t, digest }
export function invalidateKnowledgeState(examId) { _KS_CACHE.delete(Number(examId)); }
export function knowledgeStateDigest(examId, ttlMs = 45000) {
  const key = Number(examId);
  const c = _KS_CACHE.get(key);
  if (c && Date.now() - c.t < ttlMs) return c.digest;
  let digest = "";
  try { digest = _buildKnowledgeState(key); } catch { digest = ""; }
  _KS_CACHE.set(key, { t: Date.now(), digest });
  return digest;
}
function _buildKnowledgeState(examId) {
  const m = masteryMatrix(examId);
  if (!m.length) return "";
  const by = { mastered: 0, ok: 0, weak: 0, unlearned: 0 };
  for (const k of m) by[k.level] = (by[k.level] || 0) + 1;
  const weak = m.filter((k) => k.level === "weak").map((k) => k.title);
  const _sc = scopeSql(examScope(examId));
  let dueTitles = [];
  try {
    dueTitles = db.prepare(`SELECT DISTINCT kp.title FROM review_queue rq JOIN questions q ON q.id=rq.question_id
      LEFT JOIN knowledge_points kp ON kp.id=q.kp_id
      WHERE q.exam_id IN ${_sc} AND q.flagged=0 AND rq.due_date <= date('now','localtime') AND kp.title IS NOT NULL LIMIT 12`).all().map((r) => r.title);
  } catch {}
  const dueN = dueReviewCount(examId);
  const s = examSummary(examId);
  const lines = [];
  lines.push(`掌握分布(共${m.length}个知识点):已掌握${by.mastered}·一般${by.ok}·薄弱${by.weak}·未学${by.unlearned};累计做题${s.done}·总正确率${s.accuracy}%`);
  if (weak.length) lines.push(`薄弱点:${weak.slice(0, 8).join("、")}${weak.length > 8 ? "…等" + weak.length + "个" : ""}`);
  if (dueN) lines.push(`记忆曲线·到期该复习:${dueN}道题${dueTitles.length ? "(涉及:" + dueTitles.join("、") + ")" : ""}`);
  return lines.join("\n");
}
