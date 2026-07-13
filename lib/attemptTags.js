// 作答标记:结构化"掌握度标记"(careless/guessed/slow,会校准掌握度)+ 任意自定义标签(labels)。
// 供 /api/questions/tag(按钮)和讨论 finalize(追问)共用——所以按钮和追问都能打标记、也能加任意标签。
import db from "@/lib/db";
import { updateReviewQueue, invalidateKnowledgeState } from "@/lib/mastery";
import { addFact } from "@/lib/memory";

function kpTitle(kpId) { return kpId ? (db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(kpId)?.title || "") : ""; }

export function applyMasteryTag(userId, at, tagIn) {
  const t = ["careless", "guessed", "slow"].includes(tagIn) ? tagIn : null;
  db.prepare("UPDATE attempts SET tag=? WHERE id=?").run(t, at.id);
  const kt = kpTitle(at.kp_id);
  let note = "已清除标记";
  try {
    if (t === "careless") { note = "已记为粗心 · 基本不计入掌握度"; addFact(userId, at.exam_id, { subject: kt || "粗心追踪", kind: "observation", claim: `「${kt}」这题是粗心错的、不是不会;归入 careless 追踪`, valence: "neutral", scope: "exam" }); }
    else if (t === "guessed") { note = "已记为猜对 · 已排验证题尽快再考"; updateReviewQueue(at.question_id, false); addFact(userId, at.exam_id, { subject: kt || "验证", kind: "observation", claim: `「${kt}」这题是猜对的,证据打折、需验证`, valence: "weak", scope: "exam" }); }
    else if (t === "slow") { note = "已记为懂但慢 · 会安排练速度"; addFact(userId, at.exam_id, { subject: kt || "速度", kind: "observation", claim: `「${kt}」理解但速度不足,需专门练速度`, valence: "neutral", scope: "exam" }); }
    invalidateKnowledgeState(at.exam_id);
  } catch {}
  return { tag: t, note };
}

// 任意自定义标签:每个标签带一个【影响】effect = up(算掌握,提升进度)/ down(算薄弱,拉低进度)/ none(只是标签,不影响)。
// 存进 attempts.labels(按 name 去重),并给每个标签落一条记忆观察(valence 随 effect)。这样自定义标记也能影响进度评估。
function normLabel(l) {
  if (l && typeof l === "object") { const name = String(l.name || "").trim().slice(0, 40); const effect = ["up", "down", "none"].includes(l.effect) ? l.effect : "none"; return name ? { name, effect } : null; }
  const name = String(l || "").trim().slice(0, 40); return name ? { name, effect: "none" } : null;
}
export function addLabels(userId, at, labelsIn) {
  const clean = (Array.isArray(labelsIn) ? labelsIn : []).map(normLabel).filter(Boolean).slice(0, 8);
  if (!clean.length) return [];
  let cur = []; try { cur = (JSON.parse(at.labels || "[]") || []).map(normLabel).filter(Boolean); } catch {}
  const byName = {}; for (const l of [...cur, ...clean]) byName[l.name] = l; // 后者(新的)覆盖
  const merged = Object.values(byName).slice(0, 20);
  db.prepare("UPDATE attempts SET labels=? WHERE id=?").run(JSON.stringify(merged), at.id);
  const kt = kpTitle(at.kp_id);
  try { for (const l of clean) addFact(userId, at.exam_id, { subject: kt || "标记", kind: "observation", claim: `标记「${l.name}」${l.effect === "down" ? "(算薄弱)" : l.effect === "up" ? "(算掌握)" : ""}:${kt || "这道题"}`, valence: l.effect === "down" ? "weak" : l.effect === "up" ? "strong" : "neutral", scope: "exam" }); } catch {}
  try { invalidateKnowledgeState(at.exam_id); } catch {}
  return clean;
}
