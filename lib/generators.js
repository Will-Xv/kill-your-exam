// 供工作流 agent 复用的生成逻辑
import db, { getDocument, familyScope, scopeSql } from "./db";
import { generateJson, embed, cosine, langInstruction, examLangInstruction } from "./gemini";
import { retrieve, ragBlock, materialParts, mmOpts } from "./rag";
import { resolveExamLang } from "./examlang";
import { findAndStoreMusic, alignStemToMusic } from "./music";
import { AiError } from "./errors";

export async function buildKnowledgeTree(exam, lang, opts = {}) {
  const dossier = getDocument(exam.id, "dossier")?.content_md || "";
  const sample = db.prepare("SELECT heading_path, substr(content,1,200) c FROM chunks WHERE exam_id=? LIMIT 40").all(exam.id);
  const sampleText = sample.map((s) => `${s.heading_path}: ${s.c}`).join("\n").slice(0, 12000);
  const schema = { type: "object", properties: { chapters: { type: "array", items: { type: "object", properties: { title: { type: "string" }, points: { type: "array", items: { type: "string" } } }, required: ["title", "points"] } } }, required: ["chapters"] };
  // 篇幅按时间预算/时长缩放:小测想在 X 分钟复习完,就不能按整门课的量堆知识点。
  const budget = opts.timeBudgetMin ? Number(opts.timeBudgetMin) : (opts.durationMin ? Number(opts.durationMin) : null);
  const targetN = budget ? Math.max(2, Math.min(20, Math.round(budget / 15))) : null; // 约每点 15 分钟(含精读+做题),小测宁少勿多
  const sizeRule = budget
    ? `【篇幅要求·最重要】这是用户希望在约 ${budget} 分钟内复习完的【聚焦小测/任务】,不是一整门课。请【不要分章节】:只输出【一个】章节(标题直接用考试名),把这次要复习的知识点全部平铺在它下面。叶子知识点【总共】(不是每章、是整份加起来)只要 ${targetN} 个左右——比如约一小时就【总共只列 3~4 个】最核心的点,【宁少勿多、绝不要超过 ${targetN + 1} 个】。把相关的小点合并成一个大点,【绝对不要】为了完整而罗列或把主题拆细。${opts.emphasis ? `本次侧重:${opts.emphasis};只围绕它,其它一概不放。` : ""}${opts.notes ? `范围/说明:${opts.notes}。严格限定在这个范围内。` : ""}`
    : "每章3~10点";
  const treePrompt = `根据考试档案${sampleText ? "和资料摘要" : ""}${materialParts(exam.id).length ? "以及附件里的图片/音频原件" : ""}生成「${exam.name}」的知识点树(章→知识点),${sizeRule},具体可学、可练。若有音频/图片资料,请把需要多模态练习的能力(如听力理解、看图分析)也纳入。【重要·只放能学能练的知识/技能】知识点树里【绝对不要】放考务/事务性内容——如报名/缴费/考试流程/机考纸笔切换/成绩单(如 eTRF)下载与申请、单科重考政策与申请流程、证书办理、考场规则/礼仪、备考时间线规划等;这些属于「考前准备」,不是知识点。只收录真正要学的知识与要练的技能(如听力题型技巧、阅读定位、写作结构、口语表达、词汇语法等)。\n档案:\n${dossier.slice(0, 8000)}\n${sampleText ? "资料摘要:\n" + sampleText : ""}` + langInstruction(lang);
  const tree = await generateJson(treePrompt, schema, mmOpts(exam.id, treePrompt));
  const chunkRows = db.prepare(`SELECT embedding FROM chunks WHERE exam_id IN ${scopeSql(familyScope(exam.id))}`).all();
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
  qtype: { type: "string", enum: ["single", "multi", "judge", "fill", "short", "perform"] }, stem: { type: "string" },
  options: { type: "array", items: { type: "string" } }, answer: { type: "string" }, explanation: { type: "string" }, difficulty: { type: "integer" },
  perform: { type: "object", properties: { captureType: { type: "string", enum: ["audio", "video"] }, mediaMaterialId: { type: "integer" }, analyzeAudio: { type: "string", enum: ["music", "recorded", "both"] }, countdownSec: { type: "integer" }, autoStopAfterMediaSec: { type: "integer" }, rubric: { type: "array", items: { type: "string" } }, instructions: { type: "string" } } }
}, required: ["qtype", "stem", "difficulty"] } } }, required: ["questions"] };

export async function generateQuestionsForKp(exam, kp, count, lang) {
  let lessons = ""; try { lessons = db.prepare("SELECT text FROM gen_lessons WHERE exam_id=? ORDER BY id DESC LIMIT 12").all(exam.id).map((x) => "- " + x.text).join("\n"); } catch {}
  const chapter = kp.parent_id ? db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(kp.parent_id)?.title : "";
  const hits = await retrieve(exam.id, `${chapter} ${kp.title}`, 5);
  const sourceType = hits.length ? "material" : "model";
  const mparts = materialParts(exam.id, { max: 4 });
  let otherNote = ""; try { const cl = JSON.parse(exam.checklist || "[]"); otherNote = (cl.find((c) => c.item === "其他文件或说明")?.answer || ""); } catch {}
  const noteText = `${otherNote} ${exam.notes || ""}`;
  const performOnly = /(只|仅)[^。;\n]{0,12}(音视频|视频|录音|录像|表演|演唱|朗诵|舞蹈|口语|弹奏|演奏)/.test(noteText)
    || /(不要|别出|不出|无需|不需要|不考|去掉)[^。;\n]{0,12}(选择|判断|填空|简答|笔试|客观|文字|理论)/.test(noteText);
  const perfExam = exam.exam_type === "performance";
  const perfOn = performOnly || perfExam; // 表演/艺术类考试:一律强制只出录音录像题
  const audioMats = db.prepare("SELECT id, filename FROM materials WHERE exam_id=? AND kind='audio' AND status='ready' AND COALESCE(auto,0)=0").all(exam.id);
  const audioList = audioMats.map((m) => `[${m.id}] ${m.filename}`).join(" ; ");
  const performBlock = `\n【表演题规格】qtype="perform"(考生录音/录像作答)需填:captureType(audio/video)、mediaMaterialId(要放的音频素材 id,可选:${audioList || "(暂无,填 0)"};没有填 0)、analyzeAudio(舞蹈/形体=music;声乐/台词/朗诵/演讲=recorded;两者=both)、countdownSec(一般3)、autoStopAfterMediaSec(音频结束后几秒自动停,一般7)、rubric(评分维度)、instructions(说明);stem 写命题(如"跟随所给音乐即兴舞蹈")。【重要】给定音乐的题里,stem 和 instructions 都【不要】写死具体曲名、乐器或曲风(如"二胡古典曲""电子乐"),因为配乐由系统自动附上、风格未必一致;一律只说"所给音乐/上方试听的音乐"。`;
  const examLang = await resolveExamLang(exam);
  const langRule = examLang ? `\n【出题语言 · 必须遵守】题干、选项、标准答案、评分要点、解析全部用 ${examLang} 书写(这门考试真正考试时用的语言),不要用界面语言。` : examLangInstruction();
  const directive = perfOn
    ? `【最高优先级 · 必须严格遵守】只出 qtype="perform" 的录音/录像作答题,一道笔试/选择/判断/填空/简答/理论题都不要出。这是艺术/表演/技能类考试,考生要用录音或录像作答。${otherNote ? "\n考生原话:" + otherNote : ""}\n`
    : (otherNote ? `【考生补充要求 · 优先遵守】${otherNote}\n` : "");
  const genPrompt = perfOn
    ? directive + `为「${exam.name}」出 ${count} 道【表演任务题】(qtype 全部为 "perform"),围绕「${kp.title}」(章节:${chapter}),按真实考试规则设计。\n【重要】如果「${kp.title}」其实是考务/规则/防作弊/录制要领之类的事务性知识点,请【忽略它】,改为围绕这门艺术考试真正要考的表演能力(命题表演/台词/声乐/形体/朗诵/即兴/演奏等)出题。${performBlock}\n每题填全 perform 字段,stem 写命题,绝不输出任何笔试/选择/判断/填空/简答题。` + langRule
    : directive + `为「${exam.name}」出 ${count} 道题,考察「${kp.title}」(章节:${chapter})。题型按这门考试的性质来定。
${hits.length ? "必须依据资料:\n" + ragBlock(hits) : "无资料支撑,只出保守的基本概念题,不编造具体数字。"}
single/multi给4选项,answer写字母(多选如AC);judge写"对"或"错"(中文);fill写标准答案;short写评分要点;explanation解释;difficulty 1~3。资料语言与输出语言不同时术语可保留原文,其余不混语言。
严禁答题技巧/应试策略题、考试规则事务题(这些归考前准备)。${mparts.length ? "\n【多模态】本考试有图片/音频原件(见附件),鼓励据此出听力/看图题:题干注明「请听/看附件」,答案依据附件。" : ""}${performBlock}
数学公式和符号一律用 LaTeX 并用 $...$ 或 $$...$$ 包裹,不要裸露反斜杠命令。
【防泄题】同一组题内答案不得泄露、各题不要高度相似或反复考同一点。` + (lessons ? "\n\n【避免重蹈以下已知毛病】\n" + lessons : "") + langRule;
  const out = await generateJson(genPrompt, qSchema, mmOpts(exam.id, genPrompt));
  const refs = JSON.stringify(hits.map((h) => ({ chunk_id: h.id, filename: h.filename, heading: h.heading_path })));
  const ins = db.prepare("INSERT INTO questions(exam_id,kp_id,qtype,body,answer,difficulty,source_type,source_refs) VALUES(?,?,?,?,?,?,?,?)");
  let n = 0;
  for (const q of (out.questions || []).slice(0, count)) {
    if (!q.stem) continue;
    if (q.qtype === "perform") {
      const p = q.perform || {}; const cap = p.captureType === "video" ? "video" : "audio"; const aa = p.analyzeAudio || (cap === "video" && p.mediaMaterialId ? "music" : "recorded");
      let mediaMaterialId = p.mediaMaterialId || null; let autoMusic = false;
      if (!mediaMaterialId && (aa === "music" || aa === "both")) { const _mid = await findAndStoreMusic(exam.id, `${kp.title} ${q.stem}`); if (!_mid) throw new AiError("music", "given-music perform task: music source failed"); mediaMaterialId = _mid; autoMusic = true; }
      let pStem = q.stem, pInstr = p.instructions || "";
      if (autoMusic) {
        const st = db.prepare("SELECT ai_style FROM materials WHERE id=?").get(mediaMaterialId)?.ai_style || "";
        const aligned = await alignStemToMusic(pStem, pInstr, st);
        if (aligned) { pStem = aligned.stem; pInstr = aligned.instructions || pInstr; }
        pInstr = pInstr + (st ? ` (所给音乐实际风格:${st})` : "") + " 【说明】这类题练的就是「现场给定音乐即兴发挥」:所给音乐由系统随机附上、你事先并不知道风格,正是要练的临场反应;重点是快速抓住它的节奏与情绪并即兴贴合,不必在意具体是哪首曲子。";
      }
      ins.run(exam.id, kp.id, "perform", JSON.stringify({ stem: pStem, captureType: cap, mediaMaterialId, analyzeAudio: aa, countdownSec: p.countdownSec || 3, autoStopAfterMediaSec: p.autoStopAfterMediaSec || 7, maxDurationSec: 300, rubric: p.rubric || [], instructions: pInstr }), JSON.stringify({ rubric: p.rubric || [], notes: q.explanation || "" }), q.difficulty || 2, sourceType, refs);
      n++; continue;
    }
    if (!q.answer) continue;
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

// 重建知识点树,带三档"旧记录保留"策略:
//  keep      = 把旧做题记录/掌握度/沉淀按语义迁移到新知识点
//  summarize = 把旧表现浓缩成一句"观察"挂到最相近的新知识点,清掉原始做题记录
//  none      = 清空做题记录与观察,干净重来(题库保留并重挂到新知识点)
export async function rebuildKnowledgeTree(exam, lang, mode = "keep", opts = {}) {
  const m = ["keep", "summarize", "none"].includes(mode) ? mode : "keep";
  const leafSql = "SELECT kp.id, kp.title, ch.title chapter FROM knowledge_points kp LEFT JOIN knowledge_points ch ON ch.id=kp.parent_id WHERE kp.exam_id=? AND kp.parent_id IS NOT NULL";
  const oldLeaves = db.prepare(leafSql).all(exam.id);

  // summarize:重建前先把每个有活动的旧知识点总结成一句(批量一次 AI)
  let summaries = [];
  if (m === "summarize" && oldLeaves.length) {
    const active = [];
    for (const lf of oldLeaves) {
      const st = db.prepare("SELECT COUNT(*) n, SUM(correct) c FROM attempts WHERE kp_id=?").get(lf.id);
      const ins = db.prepare("SELECT kind, text FROM insights WHERE kp_id=? ORDER BY id DESC LIMIT 5").all(lf.id);
      if ((st.n || 0) > 0 || ins.length) active.push({ oldId: lf.id, label: `${lf.chapter || ""}/${lf.title}`, attempts: st.n || 0, correct: st.c || 0, insights: ins.map((x) => `${x.kind}:${x.text}`) });
    }
    if (active.length) {
      const schema = { type: "object", properties: { summaries: { type: "array", items: { type: "object", properties: { oldId: { type: "integer" }, text: { type: "string" }, kind: { type: "string", enum: ["understanding", "gap"] } }, required: ["oldId", "text", "kind"] } } }, required: ["summaries"] };
      const prompt = `下面是考生在若干旧知识点上的练习表现与讨论沉淀。请为【每个】知识点写一句话,客观总结考生当前掌握情况(到位之处 或 仍薄弱/误区),供重建知识点树后挂到对应的新知识点上。kind: understanding=掌握较好, gap=仍薄弱。\n${JSON.stringify(active).slice(0, 8000)}` + langInstruction(lang);
      try { const out = await generateJson(prompt, schema, {}); summaries = out.summaries || []; } catch {}
    }
  }

  const stats = await buildKnowledgeTree(exam, lang, opts); // 删旧点、建新点、算覆盖
  const newLeaves = db.prepare(leafSql).all(exam.id);

  // 旧→新 映射(向量最相近)
  const map = {};
  if (oldLeaves.length && newLeaves.length) {
    const oldVecs = await embed(oldLeaves.map((l) => `${l.chapter || ""}/${l.title}`));
    const newVecs = await embed(newLeaves.map((l) => `${l.chapter || ""}/${l.title}`));
    oldLeaves.forEach((ol, i) => {
      let best = -1, bj = -1;
      newVecs.forEach((nv, j) => { const s = cosine(oldVecs[i], nv); if (s > best) { best = s; bj = j; } });
      if (bj >= 0 && best >= 0.5) map[ol.id] = newLeaves[bj].id;
    });
  }

  // 题库始终跟随重映射(未命中置 NULL,避免挂到已删除的点)
  for (const ol of oldLeaves) db.prepare("UPDATE questions SET kp_id=? WHERE kp_id=? AND exam_id=?").run(map[ol.id] || null, ol.id, exam.id);

  if (m === "keep") {
    for (const ol of oldLeaves) {
      const nid = map[ol.id] || null;
      db.prepare("UPDATE attempts SET kp_id=? WHERE kp_id=? AND exam_id=?").run(nid, ol.id, exam.id);
      db.prepare("UPDATE insights SET kp_id=? WHERE kp_id=? AND exam_id=?").run(nid, ol.id, exam.id);
    }
  } else if (m === "summarize") {
    db.prepare("DELETE FROM attempts WHERE exam_id=?").run(exam.id);
    db.prepare("DELETE FROM insights WHERE exam_id=?").run(exam.id);
    const insI = db.prepare("INSERT INTO insights(exam_id,kp_id,question_id,kind,text) VALUES(?,?,?,?,?)");
    for (const s of summaries) { const nid = map[s.oldId]; if (nid && s.text) insI.run(exam.id, nid, null, s.kind === "gap" ? "gap" : "understanding", s.text); }
  } else { // none
    db.prepare("DELETE FROM attempts WHERE exam_id=?").run(exam.id);
    db.prepare("DELETE FROM insights WHERE exam_id=?").run(exam.id);
  }
  return { ...stats, mode: m, remapped: Object.keys(map).length };
}
