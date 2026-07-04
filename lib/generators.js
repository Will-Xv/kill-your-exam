// 供工作流 agent 复用的生成逻辑
import db, { getDocument } from "./db";
import { generateJson, embed, cosine, langInstruction, examLangInstruction } from "./gemini";
import { retrieve, ragBlock, materialParts, mmOpts } from "./rag";

export async function buildKnowledgeTree(exam, lang) {
  const dossier = getDocument(exam.id, "dossier")?.content_md || "";
  const sample = db.prepare("SELECT heading_path, substr(content,1,200) c FROM chunks WHERE exam_id=? LIMIT 40").all(exam.id);
  const sampleText = sample.map((s) => `${s.heading_path}: ${s.c}`).join("\n").slice(0, 12000);
  const schema = { type: "object", properties: { chapters: { type: "array", items: { type: "object", properties: { title: { type: "string" }, points: { type: "array", items: { type: "string" } } }, required: ["title", "points"] } } }, required: ["chapters"] };
  const treePrompt = `根据考试档案${sampleText ? "和资料摘要" : ""}${materialParts(exam.id).length ? "以及附件里的图片/音频原件" : ""}生成「${exam.name}」的知识点树(章→知识点),每章3~10点,具体可学。若有音频/图片资料,请把需要多模态练习的能力(如听力理解、看图分析)也纳入。\n档案:\n${dossier.slice(0, 8000)}\n${sampleText ? "资料摘要:\n" + sampleText : ""}` + langInstruction(lang);
  const tree = await generateJson(treePrompt, schema, mmOpts(exam.id, treePrompt));
  const chunkRows = db.prepare("SELECT embedding FROM chunks WHERE exam_id=?").all(exam.id);
  const chunkVecs = chunkRows.map((r) => new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4));
  db.prepare("DELETE FROM knowledge_points WHERE exam_id=?").run(exam.id);
  const insCh = db.prepare("INSERT INTO knowledge_points(exam_id,parent_id,title,sort,coverage) VALUES(?,?,?,?,?)");
  let sort = 0, total = 0;
  for (const ch of tree.chapters) {
    const chId = insCh.run(exam.id, null, ch.title, sort++, "none").lastInsertRowid;
    let vecs = [];
    if (chunkVecs.length && ch.points.length) vecs = await embed(ch.points.map((t) => `${ch.title} ${t}`));
    ch.points.forEach((t, i) => {
      let coverage = "none";
      if (vecs[i]) { let best = 0; for (const cv of chunkVecs) best = Math.max(best, cosine(vecs[i], cv)); coverage = best > 0.62 ? "covered" : best > 0.5 ? "partial" : "none"; }
      insCh.run(exam.id, chId, t, i, coverage); total++;
    });
  }
  return { chapters: tree.chapters.length, points: total };
}

const qSchema = { type: "object", properties: { questions: { type: "array", items: { type: "object", properties: {
  qtype: { type: "string", enum: ["single", "multi", "judge", "fill", "short"] }, stem: { type: "string" },
  options: { type: "array", items: { type: "string" } }, answer: { type: "string" }, explanation: { type: "string" }, difficulty: { type: "integer" }
}, required: ["qtype", "stem", "answer", "explanation", "difficulty"] } } }, required: ["questions"] };

export async function generateQuestionsForKp(exam, kp, count, lang) {
  let lessons = ""; try { lessons = db.prepare("SELECT text FROM gen_lessons WHERE exam_id=? ORDER BY id DESC LIMIT 12").all(exam.id).map((x) => "- " + x.text).join("\n"); } catch {}
  const chapter = kp.parent_id ? db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(kp.parent_id)?.title : "";
  const hits = await retrieve(exam.id, `${chapter} ${kp.title}`, 5);
  const sourceType = hits.length ? "material" : "model";
  const mparts = materialParts(exam.id, { max: 4 });
  const mediaRule = mparts.length
    ? "\n【本考试有图片/音频原件(见附件)】可以且鼓励据此出需要多模态的题(听力/看图/看谱等):题干写明「请听附件音频/看附件图片」,答案与解析依据附件;同一段音频或图片可出多道不同的题。"
    : "\n${mediaRule}";
  const genPrompt = `为「${exam.name}」出 ${count} 道题,考察「${kp.title}」(章节:${chapter})。题型混合,客观题为主。
${hits.length ? "必须依据资料:\n" + ragBlock(hits) : "无资料支撑,只出保守的基本概念题,不编造具体数字。"}
single/multi给4选项,answer写字母(多选如AC);judge的answer写"对"或"错"(保持中文);fill写标准答案;short写评分要点。explanation解释原因。difficulty 1~3。资料语言与输出语言不同时术语可保留原文,其余不混语言。\n\n【出题铁律 · 只出知识性题目】只出考查"对学科知识点本身的理解与运用"的题。严禁出以下任何一类(它们不属于平时练习,归到"考前自测"):
- 一切"答题技巧/应试策略"类(如时间分配、遇到某类题该怎么答、某种陷阱如何应对、蒙题技巧等),不分科目一律不出;
${mediaRule}
- 考试规则/报名/时间/费用/重考政策等事务性信息题。
以上只作为背景知识或考前提醒出现,绝不当知识练习题。
数学公式和符号一律用 LaTeX 表示,并用 $...$ 包裹(行内)或 $$...$$(独立成行),不要输出裸露的反斜杠命令。\n【防泄题】同一组题内不得有答案泄露:任何一道题的答案不得出现在另一道题的题干里;各题不要高度相似,也不要反复考同一个点。` + (lessons ? "\n\n【避免重蹈以下已知毛病】\n" + lessons : "") + examLangInstruction();
  const out = await generateJson(genPrompt, qSchema, mmOpts(exam.id, genPrompt));
  const refs = JSON.stringify(hits.map((h) => ({ chunk_id: h.id, filename: h.filename, heading: h.heading_path })));
  const ins = db.prepare("INSERT INTO questions(exam_id,kp_id,qtype,body,answer,difficulty,source_type,source_refs) VALUES(?,?,?,?,?,?,?,?)");
  let n = 0;
  for (const q of out.questions.slice(0, count)) {
    ins.run(exam.id, kp.id, q.qtype, JSON.stringify({ stem: q.stem, options: q.options || [] }), JSON.stringify({ answer: q.answer, explanation: q.explanation }), q.difficulty || 2, sourceType, refs);
    n++;
  }
  return n;
}

// 上传/采集新资料后:在不删除现有知识点的前提下,把新资料涉及、但树里还没有的知识点补进来(增)
export async function augmentKnowledgeTree(exam, lang) {
  const kps = db.prepare("SELECT id, parent_id, title FROM knowledge_points WHERE exam_id=?").all(exam.id);
  if (!kps.length) return 0; // 还没有树(建考试时会生成),这里不处理
  const chapters = kps.filter((k) => k.parent_id == null);
  const existing = kps.map((k) => k.title);
  const sample = db.prepare("SELECT heading_path, substr(content,1,160) c FROM chunks WHERE exam_id=? ORDER BY id DESC LIMIT 40").all(exam.id);
  const sampleText = sample.map((s) => `${s.heading_path}: ${s.c}`).join("\n").slice(0, 8000);
  const parts = materialParts(exam.id, { max: 4 });
  if (!sampleText && !parts.length) return 0;
  const schema = { type: "object", properties: { additions: { type: "array", items: { type: "object", properties: { chapter: { type: "string" }, point: { type: "string" } }, required: ["chapter", "point"] } } }, required: ["additions"] };
  const prompt = `已有章节:${chapters.map((c) => c.title).join(" / ") || "(无)"}\n已有全部知识点(绝不要重复):${existing.join(" / ")}\n下面是【新加入的资料】(文字摘要或附件里的图片/音频原件)。只找出资料里明确涉及、但现有知识点树里【还没有】的知识点,作为 additions 返回(最多 8 个)。chapter 用最贴近的现有章节名;没有合适章节就用"补充(来自新资料)"。若有音频/图片资料,也把需要多模态练的能力(如听力理解、看图分析)按需补进来。没有要补的就返回空数组。\n资料摘要:\n${sampleText || "(无文字摘要,见附件)"}` + langInstruction(lang);
  let out; try { out = await generateJson(prompt, schema, mmOpts(exam.id, prompt)); } catch { return 0; }
  const adds = (out.additions || []).slice(0, 8);
  if (!adds.length) return 0;
  const insKp = db.prepare("INSERT INTO knowledge_points(exam_id,parent_id,title,sort,coverage) VALUES(?,?,?,?,?)");
  const chByTitle = {}; chapters.forEach((c) => (chByTitle[c.title] = c.id));
  let maxSort = db.prepare("SELECT COALESCE(MAX(sort),0) m FROM knowledge_points WHERE exam_id=? AND parent_id IS NULL").get(exam.id).m;
  const lower = new Set(existing.map((t) => t.toLowerCase().trim()));
  let added = 0;
  for (const a of adds) {
    if (!a.point || lower.has(a.point.toLowerCase().trim())) continue;
    let chId = chByTitle[a.chapter];
    if (!chId) { chId = insKp.run(exam.id, null, a.chapter || "补充(来自新资料)", ++maxSort, "none").lastInsertRowid; chByTitle[a.chapter] = chId; }
    insKp.run(exam.id, chId, a.point, 999, "none");
    lower.add(a.point.toLowerCase().trim());
    added++;
  }
  return added;
}
