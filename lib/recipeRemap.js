// Workflow Recipe MVP-3:配方触发的【知识点结构重切】+ 大改前 diff 预览 + 非破坏性语义重映射(复用 embedding + checkpoint)。
// 把现有知识点按指令(如"按逻辑主题重组/按难度分段")重新分组;原始作答永不删,只把 kp_id 重指到语义最近的新点;改前打 checkpoint 可回退。
import db, { setSetting, getSetting } from "@/lib/db";
import { generateJson, langInstruction, embed, cosine } from "@/lib/gemini";
import { leafKpList, invalidateKnowledgeState } from "@/lib/mastery";
import { snapshot, integrityFix } from "@/lib/checkpoint";

const KEY = (examId) => `resegment_proposal:${examId}`;
const norm = (t) => String(t || "").toLowerCase().trim();

// 统计一批旧知识点上会被影响的数据(作答/错题/复习)。
function impact(examId, oldIds) {
  const inSql = "(" + oldIds.map(Number).join(",") + ")";
  const attempts = db.prepare(`SELECT COUNT(*) n FROM attempts WHERE exam_id=? AND kp_id IN ${inSql} AND mode!='resolved'`).get(examId).n || 0;
  const reviews = db.prepare(`SELECT COUNT(*) n FROM review_queue rq JOIN questions q ON q.id=rq.question_id WHERE q.exam_id=? AND q.kp_id IN ${inSql}`).get(examId).n || 0;
  const insights = db.prepare(`SELECT COUNT(*) n FROM insights WHERE exam_id=? AND kp_id IN ${inSql}`).get(examId).n || 0;
  const questions = db.prepare(`SELECT COUNT(*) n FROM questions WHERE exam_id=? AND kp_id IN ${inSql}`).get(examId).n || 0;
  return { attempts, reviews, insights, questions };
}

// 1) 提案 + diff(不改动任何数据)。AI 把现有叶子知识点重组成新结构,并给旧→新映射。
export async function proposeResegment(user, exam, instruction) {
  const leaves = leafKpList(exam.id);
  if (leaves.length < 4) return { error: "too_few_kps", count: leaves.length };
  const listStr = leaves.map((l) => `- ${l.chapter ? l.chapter + " / " : ""}${l.title}`).join("\n");
  const out = await generateJson(
    `把「${exam.name}」现有的这些知识点按下面要求【重新分组】成一套新结构(不是新增知识,是把已有的重新组织)。
要求:${String(instruction || "按逻辑主题重组").slice(0, 300)}
现有知识点:
${listStr}
输出:①chapters:新的分组,每组 {title(新章节名), leaves:[新叶子知识点标题]}(新叶子可以是把几个旧点合并、或原样、或改名);②mapping:【每一个旧知识点标题】→它应归入的【新叶子标题】,逐条列全,别漏;③summary:一句话说明这次怎么重组的。忠于要求,别乱造。` + langInstruction(user.lang),
    { type: "object", properties: {
      chapters: { type: "array", items: { type: "object", properties: { title: { type: "string" }, leaves: { type: "array", items: { type: "string" } } }, required: ["title", "leaves"] } },
      mapping: { type: "array", items: { type: "object", properties: { old: { type: "string" }, to: { type: "string" } }, required: ["old", "to"] } },
      summary: { type: "string" },
    }, required: ["chapters", "mapping"] }
  );
  const newLeaves = [...new Set((out.chapters || []).flatMap((c) => (c.leaves || []).map((x) => String(x))))];
  // 旧标题(norm) → 新叶子标题
  const mapByOld = {}; for (const m of (out.mapping || [])) mapByOld[norm(m.old)] = m.to;
  // 每个旧叶子的去向 + 未映射(孤儿)
  const moves = []; const orphanIds = [];
  for (const lf of leaves) { const to = mapByOld[norm(lf.title)]; if (to && newLeaves.some((n) => norm(n) === norm(to))) moves.push({ oldId: lf.id, oldTitle: lf.title, to }); else orphanIds.push(lf.id); }
  const oldIds = leaves.map((l) => l.id);
  const imp = impact(exam.id, oldIds);
  const orphanImp = orphanIds.length ? impact(exam.id, orphanIds) : { attempts: 0, reviews: 0, insights: 0, questions: 0 };
  const proposal = { instruction, chapters: out.chapters, mapping: out.mapping, summary: out.summary || "", createdAt: Date.now() };
  try { setSetting(KEY(exam.id), JSON.stringify(proposal)); } catch {}
  return {
    ok: true, summary: out.summary || "",
    oldKp: leaves.length, newChapters: (out.chapters || []).length, newLeaves: newLeaves.length,
    willMigrate: { attempts: imp.attempts, reviews: imp.reviews, insights: imp.insights, questions: imp.questions },
    orphans: { count: orphanIds.length, attempts: orphanImp.attempts, note: orphanIds.length ? "这些旧点没匹配到新点,其作答会解绑(kp_id→NULL,原始记录仍在)" : "无" },
    unaffected: "原始作答记录一律保留;别的考试完全不受影响;应用前会自动打回档点,可一键回退。",
    sampleMoves: moves.slice(0, 8).map((m) => `${m.oldTitle} → ${m.to}`),
    newStructure: (out.chapters || []).map((c) => `${c.title}: ${(c.leaves || []).join("、")}`),
  };
}

// 2) 应用已提案的重切:打 checkpoint → 建新结构 → 旧→新 id 映射(先按 AI mapping,再 embedding 兜底)→ 重指 questions/attempts/insights → 删旧点。
export async function applyResegment(user, exam) {
  let proposal; try { proposal = JSON.parse(getSetting(KEY(exam.id), "") || "null"); } catch {}
  if (!proposal || !proposal.chapters) return { error: "no_proposal", note: "请先用 recipe_resegment_preview 生成并确认提案" };
  const oldLeaves = leafKpList(exam.id);
  const oldAll = db.prepare("SELECT id FROM knowledge_points WHERE exam_id=?").all(exam.id).map((r) => r.id);
  // checkpoint(作用域=本考试)
  try { snapshot(user.id, [exam.id], { op: "recipe_resegment", label: `按配方重切「${exam.name}」知识结构` }); } catch {}
  // 建新结构
  const insCh = db.prepare("INSERT INTO knowledge_points(exam_id,parent_id,title,sort,coverage) VALUES(?,?,?,?,'none')");
  const insLf = db.prepare("INSERT INTO knowledge_points(exam_id,parent_id,title,sort,coverage) VALUES(?,?,?,?,'none')");
  const newLeafId = {}; // norm(title) -> id
  let cs = 0;
  for (const ch of proposal.chapters) {
    const chId = insCh.run(exam.id, null, String(ch.title || "章节"), cs++).lastInsertRowid;
    let ls = 0;
    for (const lt of [...new Set((ch.leaves || []).map(String))]) { const id = insLf.run(exam.id, chId, lt, ls++).lastInsertRowid; newLeafId[norm(lt)] = id; }
  }
  // 旧→新 id 映射
  const mapByOld = {}; for (const m of (proposal.mapping || [])) mapByOld[norm(m.old)] = m.to;
  const oldToNew = {};
  const unmapped = [];
  for (const lf of oldLeaves) { const to = mapByOld[norm(lf.title)]; const nid = to ? newLeafId[norm(to)] : null; if (nid) oldToNew[lf.id] = nid; else unmapped.push(lf); }
  // embedding 兜底(未映射的旧叶子 → 语义最近的新叶子,≥0.5)
  if (unmapped.length) {
    const newTitles = Object.keys(newLeafId); // norm titles
    try {
      const ov = await embed(unmapped.map((l) => l.title));
      const nv = await embed(newTitles);
      unmapped.forEach((lf, i) => { let best = -1, bj = -1; nv.forEach((v, j) => { const s = cosine(ov[i], v); if (s > best) { best = s; bj = j; } }); if (bj >= 0 && best >= 0.5) oldToNew[lf.id] = newLeafId[newTitles[bj]]; });
    } catch {}
  }
  // 重指(非破坏:原始行保留,只改 kp_id;未命中→NULL)
  for (const lf of oldLeaves) {
    const nid = oldToNew[lf.id] || null;
    db.prepare("UPDATE questions SET kp_id=? WHERE kp_id=? AND exam_id=?").run(nid, lf.id, exam.id);
    db.prepare("UPDATE attempts SET kp_id=? WHERE kp_id=? AND exam_id=?").run(nid, lf.id, exam.id);
    db.prepare("UPDATE insights SET kp_id=? WHERE kp_id=? AND exam_id=?").run(nid, lf.id, exam.id);
  }
  // 删旧知识点(旧章节+叶子)
  if (oldAll.length) { const inSql = "(" + oldAll.map(Number).join(",") + ")"; db.prepare(`DELETE FROM knowledge_points WHERE exam_id=? AND id IN ${inSql}`).run(exam.id); }
  try { integrityFix([exam.id]); } catch {}
  try { invalidateKnowledgeState(exam.id); } catch {}
  try { setSetting(KEY(exam.id), ""); } catch {}
  const remapped = Object.keys(oldToNew).length;
  return { ok: true, newChapters: proposal.chapters.length, remapped, orphaned: oldLeaves.length - remapped, note: "已重切并迁移;不满意可到「回档」或用 rollback 一键还原到重切前。" };
}
