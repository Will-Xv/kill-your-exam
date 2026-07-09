// 后台一次性建好一门有内容的考试(知识点树 + 蓝图 + 可选复习计划),不阻塞杀手。
// 关系(挂父/汇总)在砖头里同步做好,内容生成在这里后台跑。
import db, { getDocument, upsertDocument } from "@/lib/db";
import { searchWeb, generateJson, langInstruction } from "@/lib/gemini";
import { buildKnowledgeTree, generateQuestionsForKp } from "@/lib/generators";
import { generateBlueprint, saveBlueprint } from "@/lib/blueprint";
import { APP_CAPABILITIES } from "@/lib/appGuide";

// 立即返回:把考试置为“生成中”,后台跑 runProvision(不 await)。
export function startProvision(exam, user, opts = {}) {
  db.prepare("UPDATE exams SET setup_state='generating' WHERE id=?").run(exam.id);
  // 后台执行(Railway 持久进程:请求结束后仍会跑完)
  runProvision(exam.id, user, opts).catch((e) => {
    try { db.prepare("UPDATE exams SET setup_state='error' WHERE id=?").run(exam.id); } catch {}
    try { console.error("[provision] failed exam=" + exam.id, e); } catch {}
  });
  return { examId: exam.id, status: "generating" };
}

// 组一份考试档案(dossier):联网搜 / 沿用母考试 / 只用说明。
async function buildDossier(exam, user, opts) {
  const lines = [`考试/任务名称:${exam.name}`, `类型:${exam.exam_type || "普通"}`];
  if (exam.exam_date) lines.push(`日期:${exam.exam_date}`);
  if (opts.notes) lines.push(`说明:${opts.notes}`);
  if (opts.emphasis) lines.push(`本次侧重:${opts.emphasis}`);
  if (opts.durationMin) lines.push(`考试时长:约 ${opts.durationMin} 分钟`);
  if (opts.timeBudgetMin) lines.push(`用户希望的复习时间预算:约 ${opts.timeBudgetMin} 分钟`);
  const ctx = lines.join("\n");

  if (opts.webSearch) {
    const search = await searchWeb(`请搜索并总结这门考试的公开信息(官方大纲、题型与分值、报名与时间、教材/参考资料、近年变化)。结合以下背景精准检索:\n${ctx}\n用中文回答。若是某学校的内部考试,尽量结合该校/该课程信息。`);
    const schema = { type: "object", properties: { dossier_md: { type: "string" } }, required: ["dossier_md"] };
    const r = await generateJson(`你是诚实的备考助手。背景:\n${ctx}\n\n联网搜索结果:\n${search.text || "(没有搜到有效信息)"}\n\n${APP_CAPABILITIES}\n输出 dossier_md:Markdown 考试档案初稿(考试名/类型/日期/已知题型结构/大纲/信息来源,注明哪些来自搜索、哪些未证实,不知道的写“待补充”)。` + langInstruction(user.lang), schema);
    return r.dossier_md || `# ${exam.name}\n\n${ctx}`;
  }

  // 沿用母考试(子任务):把母考试档案当背景,叠加本次的特定说明/侧重/时长
  if (opts.inheritFromExamId) {
    const parentDossier = getDocument(opts.inheritFromExamId, "dossier")?.content_md || "";
    return `# ${exam.name}(沿用上级考试信息,并按本次说明微调)\n\n【本次特定说明】\n${ctx}\n\n【沿用自上级考试的档案(仅作背景参考,若与本次说明冲突以本次说明为准)】\n${parentDossier.slice(0, 6000)}`;
  }

  return `# ${exam.name}\n\n${ctx}`;
}

// 时间预算复习计划:当用户给了“想用 X 分钟复习完”,生成一份分块计划写进备考策略。
async function writeReviewPlan(exam, user, opts) {
  if (!opts.timeBudgetMin) return;
  const kps = db.prepare("SELECT kp.title, ch.title chapter FROM knowledge_points kp LEFT JOIN knowledge_points ch ON ch.id=kp.parent_id WHERE kp.exam_id=? AND kp.parent_id IS NOT NULL ORDER BY ch.sort, kp.sort").all(exam.id);
  if (!kps.length) return;
  const list = kps.map((k) => `${k.chapter ? k.chapter + "/" : ""}${k.title}`).join("\n");
  const schema = { type: "object", properties: { plan_md: { type: "string" } }, required: ["plan_md"] };
  const r = await generateJson(
    `为「${exam.name}」制定一份【${opts.timeBudgetMin} 分钟复习完全部内容】的紧凑复习计划(Markdown)。要把总时间切成若干时间块,分配到下面这些知识点上(重点/薄弱多给时间,简单的快速带过),每块写清:时段(如 0–15 分钟)、复习哪些点、用什么方式(快速过 / 做题 / 只看重点)。务必贴合 ${opts.timeBudgetMin} 分钟这个总预算,别超时。${opts.emphasis ? "本次侧重:" + opts.emphasis + "。" : ""}\n知识点清单:\n${list}` + langInstruction(user.lang),
    schema);
  const prev = getDocument(exam.id, "strategy")?.content_md || "";
  upsertDocument(exam.id, "strategy", `## ⏱️ ${opts.timeBudgetMin} 分钟复习计划\n\n${r.plan_md}\n\n${prev ? "---\n\n" + prev : ""}`);
}

// 母考试的“把旧考试内容带过去”:summarize / partial / copy_all(live 则什么都不带,靠实时汇总)。
async function carryOver(exam, user, carry) {
  if (!carry || !carry.mode || carry.mode === "live") return;
  const fromIds = (carry.fromExamIds || []).map(Number).filter(Boolean);
  if (!fromIds.length) return;
  const { masteryMatrix } = await import("@/lib/mastery");
  const ensureChapter = (title) => {
    const t = title || "汇总";
    let ch = db.prepare("SELECT id FROM knowledge_points WHERE exam_id=? AND parent_id IS NULL AND title=?").get(exam.id, t);
    if (!ch) return db.prepare("INSERT INTO knowledge_points(exam_id,parent_id,title,coverage) VALUES(?,?,?,?)").run(exam.id, null, t, "none").lastInsertRowid;
    return ch.id;
  };
  const insQ = db.prepare("INSERT INTO questions(exam_id,kp_id,qtype,body,answer,difficulty,source_type,source_refs,origin,answer_origin,source_url,is_real,fixed_key,must_include) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const insIns = db.prepare("INSERT INTO insights(exam_id,kp_id,question_id,kind,text) VALUES(?,?,?,?,?)");

  for (const fid of fromIds) {
    const src = db.prepare("SELECT id,name FROM exams WHERE id=?").get(fid);
    if (!src) continue;
    const chId = ensureChapter(src.name || "汇总");
    const matrix = masteryMatrix(fid);   // 每个叶子点的掌握度
    for (const kp of matrix) {
      // copy_all:全部点;partial:只带有错题/未做题的点;summarize:全部点(但题按 withQuestions 决定)
      const wrongOrUnseen = db.prepare("SELECT q.id FROM questions q WHERE q.exam_id=? AND q.kp_id=? AND q.flagged=0 AND (q.id NOT IN (SELECT question_id FROM attempts WHERE question_id IS NOT NULL) OR q.id IN (SELECT question_id FROM attempts a WHERE a.id=(SELECT id FROM attempts WHERE question_id=q.id ORDER BY id DESC LIMIT 1) AND a.correct=0))").all(fid, kp.id).map((r) => r.id);
      if (carry.mode === "partial" && !wrongOrUnseen.length) continue;  // 部分模式:没有错题/未做题的点跳过
      const newKp = db.prepare("INSERT INTO knowledge_points(exam_id,parent_id,title,coverage) VALUES(?,?,?,?)").run(exam.id, chId, kp.title, "none").lastInsertRowid;
      // 掌握状态带过去:用观察(insight)记录旧的掌握程度,而不是伪造做题记录
      if (kp.level === "mastered" || kp.level === "ok") insIns.run(exam.id, newKp, null, "understanding", `(带自「${src.name}」)之前掌握:${kp.level === "mastered" ? "已掌握" : "一般"}(正确率约 ${kp.accuracy}%)`);
      else if (kp.level === "weak") insIns.run(exam.id, newKp, null, "gap", `(带自「${src.name}」)之前薄弱(正确率约 ${kp.accuracy}%),需重点复习`);
      // 题目:copy_all=全部;summarize=按 withQuestions;partial=只带错题/未做题
      let qids = [];
      if (carry.mode === "copy_all") qids = db.prepare("SELECT id FROM questions WHERE exam_id=? AND kp_id=? AND flagged=0").all(fid, kp.id).map((r) => r.id);
      else if (carry.mode === "partial") qids = wrongOrUnseen;
      else if (carry.mode === "summarize" && carry.withQuestions) qids = db.prepare("SELECT id FROM questions WHERE exam_id=? AND kp_id=? AND flagged=0").all(fid, kp.id).map((r) => r.id);
      for (const qid of qids) {
        const q = db.prepare("SELECT * FROM questions WHERE id=?").get(qid);
        if (q) insQ.run(exam.id, newKp, q.qtype, q.body, q.answer, q.difficulty || 2, q.source_type || "model", q.source_refs || "[]", q.origin || "generated", q.answer_origin || "ai", q.source_url || null, q.is_real || 0, null, 0);
      }
    }
  }
}

async function runProvision(examId, user, opts) {
  const exam = db.prepare("SELECT * FROM exams WHERE id=?").get(examId);
  if (!exam) return;
  const role = opts.role || "standalone";
  const lang = user?.lang;

  if (role === "mother") {
    // 母考试:先把旧考试的内容按选择带过来(live 则不带,靠实时汇总);母考试一般不单独生成知识树。
    const dossier = await buildDossier(exam, user, opts);
    upsertDocument(exam.id, "dossier", dossier);
    await carryOver(exam, user, opts.carry);
    try { const bp = await generateBlueprint(exam, user, opts.notes || ""); saveBlueprint(exam.id, bp); } catch {}
  } else {
    // standalone / child:建自己的知识树 + 蓝图(+ 可选时间预算复习计划)
    const dossier = await buildDossier(exam, user, opts);
    upsertDocument(exam.id, "dossier", dossier);
    await buildKnowledgeTree(exam, lang, { timeBudgetMin: opts.timeBudgetMin, durationMin: opts.durationMin, emphasis: opts.emphasis, notes: opts.notes });
    try { const bp = await generateBlueprint(exam, user, opts.notes || ""); saveBlueprint(exam.id, bp); } catch {}
    try { await writeReviewPlan(exam, user, opts); } catch {}
  }

  db.prepare("UPDATE exams SET setup_state=NULL, assess_status='done' WHERE id=?").run(examId);
}
