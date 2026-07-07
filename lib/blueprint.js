import db, { getDocument, upsertDocument } from "@/lib/db";
import { generateJson } from "@/lib/gemini";
import { leafKpList } from "@/lib/mastery";
import { generateQuestionsForKp } from "@/lib/generators";

const DEFAULT_MARKS = { single: 2, multi: 3, judge: 1, fill: 3, short: 10, perform: 20 };

export function getBlueprint(examId) {
  try { const d = getDocument(examId, "blueprint"); return d?.content_md ? JSON.parse(d.content_md) : null; } catch { return null; }
}
export function saveBlueprint(examId, bp) { upsertDocument(examId, "blueprint", JSON.stringify(bp)); }

// 依据考试信息/资料/知识点树,生成「正式考试蓝图」(不是出题,是考试结构规划)
export async function generateBlueprint(exam, user, instructions = "") {
  const dossier = getDocument(exam.id, "dossier")?.content_md || "";
  const kps = leafKpList(exam.id);
  const kpText = kps.map((k) => `${k.chapter ? k.chapter + "/" : ""}${k.title}`).join("; ").slice(0, 3500);
  const perf = exam.exam_type === "performance";
  const schema = { type: "object", properties: {
    totalQuestions: { type: "integer" }, totalMarks: { type: "integer" }, durationMin: { type: "integer" }, overview: { type: "string" },
    sourceLevel: { type: "string" }, sourceNote: { type: "string" },
    qtypeMarks: { type: "object", properties: { single: { type: "number" }, multi: { type: "number" }, judge: { type: "number" }, fill: { type: "number" }, short: { type: "number" }, perform: { type: "number" } } },
    plan: { type: "array", items: { type: "object", properties: { chapter: { type: "string" }, kpTitle: { type: "string" }, count: { type: "integer" } }, required: ["kpTitle", "count"] } }
  }, required: ["overview", "plan"] };
  const prompt = `你是这门考试的资深命题人。依据下面的信息,设计这门考试【正式考试的蓝图】——这是考试结构规划,不是出题。
考试名称:${exam.name};类型:${exam.exam_type || "普通"};补充说明:${exam.notes || "无"}
考试档案摘要:${dossier.slice(0, 1600)}
可用知识点清单:${kpText || "(暂无,请根据考试名称合理规划)"}
${instructions ? "【用户的额外要求 · 最高优先级,必须满足】" + instructions : ""}
请给出:
- overview:一段话说明这门正式考试大概长什么样(题型构成、难度、时长、总分、评分方式)。
- totalQuestions:这门【正式考试真实的题目总数】。务必贴近真实情况——如果官方说明了题数就用官方数字,不要随便凑整或默认某个数。
- totalMarks 总分、durationMin 时长(分钟):贴近这门考试真实情况。
- qtypeMarks:每种题型每题的分值,只列这门考试真实会考的题型。${perf ? "本考试是艺术/表演类,题型只用 perform。" : ""}
- plan:一个数组,列出正式考试要覆盖的知识点以及各应出几道题 count——覆盖重要知识点、题量与重要性匹配。【所有 count 之和必须等于 totalQuestions】,严格照真实考试的题目数量来,不要人为压到某个区间。kpTitle 尽量用上面清单里的原文;若清单为空,用你判断的知识点名。
- sourceLevel:你对"这门考试的结构与题量"的依据可信度,只能是以下三者之一:
  · "official" —— 有官方考试说明/大纲明确规定了结构与题量;
  · "inferred" —— 没有官方说明,但依据用户提供的资料或网络公开信息推测;
  · "estimated" —— 已知信息很少,主要靠你对同类考试的合理预估。
- sourceNote:一句话具体说明你的依据(例如"依据 XX 官方考试大纲""根据用户上传的历年真题推测""公开信息有限,参照同类 XX 考试预估")。
只做结构规划,不要写具体题目。`;
  const bp = await generateJson(prompt, schema, {});
  bp.qtypeMarks = { ...DEFAULT_MARKS, ...(bp.qtypeMarks || {}) };
  if (!Array.isArray(bp.plan)) bp.plan = [];
  const planSum = bp.plan.reduce((s, p) => s + (Number(p.count) || 0), 0);
  if (!bp.totalQuestions || bp.totalQuestions < 1) bp.totalQuestions = planSum || 20;
  if (!["official", "inferred", "estimated"].includes(bp.sourceLevel)) bp.sourceLevel = "estimated";
  if (!bp.sourceNote) bp.sourceNote = "";
  bp.updatedAt = Date.now();
  return bp;
}

export async function ensureBlueprint(exam, user) {
  let bp = getBlueprint(exam.id);
  if (!bp) { bp = await generateBlueprint(exam, user); saveBlueprint(exam.id, bp); }
  return bp;
}

function findKp(examId, title) {
  if (!title) return null;
  return db.prepare("SELECT * FROM knowledge_points WHERE exam_id=? AND parent_id IS NOT NULL AND title LIKE ? LIMIT 1").get(examId, `%${title}%`)
    || db.prepare("SELECT * FROM knowledge_points WHERE exam_id=? AND title LIKE ? LIMIT 1").get(examId, `%${title}%`);
}

// 按蓝图组卷:每个 plan 项确保题库里有足够的题(不够就即时生成),再取题、按题型分配分值
export async function composeFromBlueprint(exam, user, bp, opts = {}) {
  const perf = exam.exam_type === "performance";
  const marks = { ...DEFAULT_MARKS, ...(bp.qtypeMarks || {}) };
  const picked = [];
  const seen = new Set();
  for (const item of (bp.plan || [])) {
    const kp = findKp(exam.id, item.kpTitle);
    if (!kp) continue;
    const need = Math.max(1, Math.min(item.count || 1, 30));
    let pool = db.prepare(`SELECT * FROM questions WHERE exam_id=? AND kp_id=? AND flagged=0 ${perf ? "AND qtype='perform'" : ""} AND id NOT IN (${[...seen, 0].join(",")}) ORDER BY RANDOM()`).all(exam.id, kp.id);
    if (pool.length < need && !opts.reuseOnly) {
      try { await generateQuestionsForKp(exam, kp, need - pool.length + 1, user.lang); } catch {}
      pool = db.prepare(`SELECT * FROM questions WHERE exam_id=? AND kp_id=? AND flagged=0 ${perf ? "AND qtype='perform'" : ""} AND id NOT IN (${[...seen, 0].join(",")}) ORDER BY RANDOM()`).all(exam.id, kp.id);
    }
    for (const q of pool.slice(0, need)) { picked.push(q); seen.add(q.id); }
  }
  const marksMap = {};
  for (const q of picked) marksMap[q.id] = marks[q.qtype] ?? 2;
  const total = picked.reduce((s, q) => s + (marksMap[q.id] || 0), 0);
  return {
    questionIds: picked.map((q) => q.id),
    marks: marksMap,
    totalMarks: total,
    durationMin: bp.durationMin || null,
    questions: picked.map((q) => ({ id: q.id, kp_id: q.kp_id, qtype: q.qtype, body: JSON.parse(q.body), marks: marksMap[q.id] || 0 })),
  };
}
