// Workflow Recipe MVP-3:配方触发的【知识点结构重切】+ 大改前 diff 预览 + 非破坏性语义重映射(复用 embedding + checkpoint)。
// 把现有知识点按指令重新分组;原始作答永不删,只把 kp_id 重指到新点;改前打 checkpoint 可回退。
// ★ 映射用【旧知识点序号】而非标题字符串,避免 AI 改写标题导致匹配失败。
import db, { setSetting, getSetting } from "@/lib/db";
import { generateJson, langInstruction, embed, cosine } from "@/lib/gemini";
import { leafKpList, invalidateKnowledgeState } from "@/lib/mastery";
import { snapshot, integrityFix } from "@/lib/checkpoint";

const KEY = (examId) => `resegment_proposal:${examId}`;
const norm = (t) => String(t || "").toLowerCase().trim();

function impact(examId, oldIds) {
  if (!oldIds.length) return { attempts: 0, reviews: 0, insights: 0, questions: 0 };
  const inSql = "(" + oldIds.map(Number).join(",") + ")";
  const one = (sql) => { try { return db.prepare(sql).get(examId).n || 0; } catch { return 0; } };
  return {
    attempts: one(`SELECT COUNT(*) n FROM attempts WHERE exam_id=? AND kp_id IN ${inSql} AND mode!='resolved'`),
    reviews: one(`SELECT COUNT(*) n FROM review_queue rq JOIN questions q ON q.id=rq.question_id WHERE q.exam_id=? AND q.kp_id IN ${inSql}`),
    insights: one(`SELECT COUNT(*) n FROM insights WHERE exam_id=? AND kp_id IN ${inSql}`),
    questions: one(`SELECT COUNT(*) n FROM questions WHERE exam_id=? AND kp_id IN ${inSql}`),
  };
}

const SCHEMA = { type: "object", properties: {
  chapters: { type: "array", items: { type: "object", properties: {
    title: { type: "string" },
    leaves: { type: "array", items: { type: "object", properties: { title: { type: "string" }, from: { type: "array", items: { type: "integer" }, description: "这个新叶子吸收了哪些旧知识点(填它们的序号)" } }, required: ["title", "from"] } },
  }, required: ["title", "leaves"] } },
  summary: { type: "string" },
}, required: ["chapters"] };

// 1) 提案 + diff(不改动任何数据)。
export async function proposeResegment(user, exam, instruction) {
  const leaves = leafKpList(exam.id); // 顺序稳定
  if (leaves.length < 4) return { error: "too_few_kps", count: leaves.length };
  const listStr = leaves.map((l, i) => `[${i + 1}] ${l.chapter ? l.chapter + " / " : ""}${l.title}`).join("\n");
  const out = await generateJson(
    `把「${exam.name}」现有的这些知识点按下面要求【重新分组】成一套新结构(不是新增知识,是把已有的重新组织)。
要求:${String(instruction || "按逻辑主题重组").slice(0, 300)}
现有知识点(带序号):
${listStr}
输出 chapters:新的分组,每组 {title(新章节名), leaves:[{title(新叶子名), from:[吸收的旧知识点【序号】]}]}。**每个旧序号都要被某个新叶子的 from 收进去,别漏号、别编不存在的号。**summary:一句话说明怎么重组的。` + langInstruction(user.lang),
    SCHEMA
  );
  // 旧序号(1-based)→ 旧 id
  const idByIdx = {}; leaves.forEach((l, i) => { idByIdx[i + 1] = l.id; });
  let newLeafCount = 0; const mappedIdx = new Set(); const sample = [];
  for (const ch of (out.chapters || [])) for (const lf of (ch.leaves || [])) {
    newLeafCount++;
    for (const idx of (lf.from || [])) { if (idByIdx[idx]) { mappedIdx.add(idx); if (sample.length < 8) { const ol = leaves[idx - 1]; sample.push(`${ol.title.slice(0, 26)} → ${lf.title.slice(0, 26)}`); } } }
  }
  const mappedIds = [...mappedIdx].map((i) => idByIdx[i]);
  const orphanIds = leaves.filter((l, i) => !mappedIdx.has(i + 1)).map((l) => l.id);
  const imp = impact(exam.id, mappedIds);
  const orphanImp = impact(exam.id, orphanIds);
  try { setSetting(KEY(exam.id), JSON.stringify({ instruction, chapters: out.chapters, summary: out.summary || "", createdAt: Date.now() })); } catch {}
  return {
    ok: true, summary: out.summary || "",
    oldKp: leaves.length, newChapters: (out.chapters || []).length, newLeaves: newLeafCount,
    willMigrate: imp,               // 会随映射迁移的数据(非破坏,只重指)
    unmapped: { count: orphanIds.length, attempts: orphanImp.attempts, note: orphanIds.length ? "这些旧点 AI 没归类,应用时会用 embedding 语义就近归入,仍归不上才解绑(原始记录都在)" : "无" },
    unaffected: "原始作答记录一律保留;别的考试完全不受影响;应用前会自动打回档点,可一键回退。",
    sampleMoves: sample,
    newStructure: (out.chapters || []).map((c) => `${c.title}: ${(c.leaves || []).map((x) => x.title).join("、")}`),
  };
}

// 2) 应用重切:打 checkpoint → 建新结构 → 旧→新 id(先 from 序号、再 embedding 兜底)→ 非破坏重指 → 删旧点。
export async function applyResegment(user, exam) {
  let p; try { p = JSON.parse(getSetting(KEY(exam.id), "") || "null"); } catch {}
  if (!p || !p.chapters) return { error: "no_proposal", note: "请先用 recipe_resegment_preview 生成并确认提案" };
  const leaves = leafKpList(exam.id);
  const idByIdx = {}; leaves.forEach((l, i) => { idByIdx[i + 1] = l.id; });
  const oldAll = db.prepare("SELECT id FROM knowledge_points WHERE exam_id=?").all(exam.id).map((r) => r.id);
  try { snapshot(user.id, [exam.id], { op: "recipe_resegment", label: `按配方重切「${exam.name}」知识结构` }); } catch {}
  const insCh = db.prepare("INSERT INTO knowledge_points(exam_id,parent_id,title,sort,coverage) VALUES(?,?,?,?,'none')");
  const insLf = db.prepare("INSERT INTO knowledge_points(exam_id,parent_id,title,sort,coverage) VALUES(?,?,?,?,'none')");
  const oldToNew = {}; const newLeafRows = []; // {id, title}
  let cs = 0;
  for (const ch of p.chapters) {
    const chId = insCh.run(exam.id, null, String(ch.title || "章节"), cs++).lastInsertRowid;
    let ls = 0;
    for (const lf of (ch.leaves || [])) {
      const nid = insLf.run(exam.id, chId, String(lf.title || "知识点"), ls++).lastInsertRowid;
      newLeafRows.push({ id: nid, title: String(lf.title || "") });
      for (const idx of (lf.from || [])) { const oid = idByIdx[idx]; if (oid) oldToNew[oid] = nid; }
    }
  }
  // embedding 兜底:AI 没归类的旧叶子 → 语义最近的新叶子(≥0.5)
  const unmapped = leaves.filter((l) => !oldToNew[l.id]);
  if (unmapped.length && newLeafRows.length) {
    try {
      const ov = await embed(unmapped.map((l) => l.title));
      const nv = await embed(newLeafRows.map((l) => l.title));
      unmapped.forEach((lf, i) => { let best = -1, bj = -1; nv.forEach((v, j) => { const s = cosine(ov[i], v); if (s > best) { best = s; bj = j; } }); if (bj >= 0 && best >= 0.5) oldToNew[lf.id] = newLeafRows[bj].id; });
    } catch {}
  }
  for (const lf of leaves) {
    const nid = oldToNew[lf.id] || null;
    db.prepare("UPDATE questions SET kp_id=? WHERE kp_id=? AND exam_id=?").run(nid, lf.id, exam.id);
    db.prepare("UPDATE attempts SET kp_id=? WHERE kp_id=? AND exam_id=?").run(nid, lf.id, exam.id);
    db.prepare("UPDATE insights SET kp_id=? WHERE kp_id=? AND exam_id=?").run(nid, lf.id, exam.id);
  }
  if (oldAll.length) db.prepare(`DELETE FROM knowledge_points WHERE exam_id=? AND id IN (${oldAll.map(Number).join(",")})`).run(exam.id);
  try { integrityFix([exam.id]); } catch {}
  try { invalidateKnowledgeState(exam.id); } catch {}
  try { setSetting(KEY(exam.id), ""); } catch {}
  const remapped = Object.keys(oldToNew).length;
  return { ok: true, newChapters: p.chapters.length, newLeaves: newLeafRows.length, remapped, orphaned: leaves.length - remapped, note: "已重切并迁移;不满意可到「回档」页或用 rollback 一键还原到重切前。" };
}
