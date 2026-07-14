// 共享:给围绕某知识点/某考试的 AI 会话拼一段【这位考生的历史】,
// 让 AI 不是"从零开始",而是知道他做过什么题、之前讨论/被观察到什么、进度到哪。
import db, { examScope, scopeSql } from "@/lib/db";
import { kpMasteryLevel, LEVELS, masteryMatrix } from "@/lib/mastery";

export function learnerKpContext(kpId, { maxAttempts = 6, maxInsights = 6 } = {}) {
  const id = Number(kpId);
  if (!id) return "";
  let level = "unlearned";
  try { level = kpMasteryLevel(id); } catch {}
  const lines = [];
  lines.push(`当前掌握度:${LEVELS[level] || level}`);
  let atts = [];
  try {
    atts = db.prepare(`SELECT correct, score, q_stem, feedback, created_at FROM attempts WHERE kp_id=? AND mode!='resolved' ORDER BY id DESC LIMIT ?`).all(id, maxAttempts);
  } catch {}
  if (atts.length) {
    const desc = atts.map((a) => {
      const stem = (a.q_stem || "").replace(/\s+/g, " ").slice(0, 40);
      const mark = a.correct ? "对" : "错";
      const sc = a.score != null ? `(${a.score}分)` : "";
      return `・[${mark}${sc}] ${stem || "(题干略)"}`;
    }).join("\n");
    const wrong = atts.filter((a) => !a.correct).length;
    lines.push(`最近练了 ${atts.length} 题、其中 ${wrong} 题没做对:\n${desc}`);
  } else {
    lines.push("还没在此知识点上做过题。");
  }
  let ins = [];
  try {
    ins = db.prepare(`SELECT kind, text FROM insights WHERE kp_id=? AND kind IN ('understanding','misconception') ORDER BY id DESC LIMIT ?`).all(id, maxInsights);
  } catch {}
  if (ins.length) {
    const good = ins.filter((x) => x.kind === "understanding").map((x) => "・" + (x.text || "").slice(0, 60));
    const bad = ins.filter((x) => x.kind === "misconception").map((x) => "・" + (x.text || "").slice(0, 60));
    if (good.length) lines.push("之前观察到他已理解:\n" + good.join("\n"));
    if (bad.length) lines.push("之前观察到他的误区/薄弱:\n" + bad.join("\n"));
  }
  return lines.join("\n");
}

// 不绑定单个知识点的功能(竞技场、自定义玩法等)用:整门考试家族的薄弱点 + 最近观察沉淀。
export function learnerExamContext(examId, { maxWeak = 8, maxInsights = 8 } = {}) {
  const id = Number(examId);
  if (!id) return "";
  const lines = [];
  let mm = [];
  try { mm = masteryMatrix(id); } catch {}
  if (mm.length) {
    const weak = mm.filter((k) => k.level === "weak" || k.level === "unlearned").slice(0, maxWeak).map((k) => "・" + (k.title || ""));
    const strong = mm.filter((k) => k.level === "mastered").slice(0, 5).map((k) => (k.title || ""));
    if (weak.length) lines.push("目前薄弱/未学的知识点:\n" + weak.join("\n"));
    if (strong.length) lines.push("已掌握:" + strong.join("、"));
  }
  let ins = [];
  try {
    const scope = scopeSql(examScope(id));
    ins = db.prepare(`SELECT kind, text FROM insights WHERE exam_id IN ${scope} AND kind IN ('understanding','misconception') ORDER BY id DESC LIMIT ?`).all(maxInsights);
  } catch {}
  if (ins.length) {
    const bad = ins.filter((x) => x.kind === "misconception").map((x) => "・" + (x.text || "").slice(0, 60));
    const good = ins.filter((x) => x.kind === "understanding").map((x) => "・" + (x.text || "").slice(0, 60));
    if (bad.length) lines.push("之前观察到的误区/薄弱:\n" + bad.join("\n"));
    if (good.length) lines.push("之前观察到已理解:\n" + good.join("\n"));
  }
  return lines.join("\n");
}
