// 类16 三语迁移追踪:根据用户的语言背景(母语/二外/三外…),把语言考试里的错误归因到
// 「母语负迁移 / 二外负迁移 / 目标语内部错误 / 粗心」,并沉淀一张三语对照表;还能在学某主题前预测迁移陷阱。
import db, { examScope, scopeSql, getSetting, setSetting } from "@/lib/db";
import { generateJson, langInstruction } from "@/lib/gemini";

const BG_KEY = (uid) => `langbg:${uid}`;

export function getLangBackground(userId) {
  try { const s = getSetting(BG_KEY(userId)); if (s) return JSON.parse(s); } catch {}
  return { native: "", known: [], target: "" };
}
export function setLangBackground(userId, bg) {
  const clean = { native: String(bg.native || "").slice(0, 40), known: (Array.isArray(bg.known) ? bg.known : []).map((x) => String(x).slice(0, 40)).filter(Boolean).slice(0, 6), target: String(bg.target || "").slice(0, 40) };
  setSetting(BG_KEY(userId), JSON.stringify(clean));
  return clean;
}

const SOURCES = ["l1_negative", "l2_negative", "target_internal", "careless"];
export const SOURCE_LABEL = { l1_negative: "母语负迁移", l2_negative: "二外/其他外语负迁移", target_internal: "目标语内部混淆", careless: "粗心/笔误" };

// 读最近做错的语言题(还没归因过的),批量让 AI 判断迁移来源 + 顺手沉淀对照表。
export async function analyzeTransfers(user, exam, { limit = 15 } = {}) {
  const bg = getLangBackground(user.id);
  const scSql = scopeSql(examScope(exam.id));
  const rows = db.prepare(
    `SELECT a.id AS attempt_id, a.kp_id, a.user_answer, q.body, q.answer
     FROM attempts a JOIN questions q ON q.id=a.question_id
     WHERE a.exam_id IN ${scSql} AND a.correct=0 AND a.mode IN ('practice','exam','review')
       AND a.id NOT IN (SELECT attempt_id FROM lang_transfer WHERE attempt_id IS NOT NULL)
     ORDER BY a.id DESC LIMIT ?`
  ).all(limit);
  if (!rows.length) return { analyzed: 0, reason: "no_new_wrong" };

  const items = rows.map((r, i) => {
    let stem = "", ans = "";
    try { stem = (JSON.parse(r.body).stem || "").slice(0, 300); } catch {}
    try { ans = (JSON.parse(r.answer).answer || "").slice(0, 200); } catch {}
    return `#${i} 题:${stem}\n  正确:${ans}\n  你答:${String(r.user_answer || "(空)").slice(0, 200)}`;
  }).join("\n");

  const bgStr = `母语=${bg.native || "未知"};已会外语=${(bg.known || []).join("、") || "无"};正在学(目标语)=${bg.target || exam.name}`;
  const out = await generateJson(
    `你是语言迁移分析专家。考生语言背景:${bgStr}。
下面是这门语言考试里做错的题(题干/正确答案/考生答案)。逐题判断这个错误最可能的【来源】:
- l1_negative:母语负迁移(把母语的语法/词序/搭配/发音习惯错误地套到目标语)
- l2_negative:已会的其他外语负迁移(比如会英语的人学西语时套用英语规则)
- target_internal:目标语内部的混淆(不涉及别的语言,就是目标语规则本身没掌握,如时态变位记错)
- careless:粗心、笔误、看错题

对每一题给 {i(编号), source, from_lang(迁移来源语言,如「中文」「英语」;target_internal/careless 填空), note(一句话说清错在哪、怎么迁移的)}。
另外,把这些错误里体现出的、值得记住的对照点,汇总成 contrast 三语对照表,每条 {concept(这个点/意思), native(母语直觉/母语怎么说), l2(已会外语怎么表达,没有可空), target(目标语正确表达), pitfall(最容易踩的坑), kind(negative=负迁移点/positive=可利用的正迁移点)}。只收有价值的、确凿的,别硬凑。

题目:
${items}` + langInstruction(user.lang),
    { type: "object", properties: {
      items: { type: "array", items: { type: "object", properties: { i: { type: "integer" }, source: { type: "string", enum: SOURCES }, from_lang: { type: "string" }, note: { type: "string" } }, required: ["i", "source"] } },
      contrast: { type: "array", items: { type: "object", properties: { concept: { type: "string" }, native: { type: "string" }, l2: { type: "string" }, target: { type: "string" }, pitfall: { type: "string" }, kind: { type: "string", enum: ["negative", "positive"] } }, required: ["concept", "target"] } },
    }, required: ["items"] }
  );

  const insT = db.prepare("INSERT OR IGNORE INTO lang_transfer(exam_id,kp_id,attempt_id,source,from_lang,to_lang,note) VALUES(?,?,?,?,?,?,?)");
  let n = 0;
  for (const it of (out.items || [])) {
    const r = rows[it.i]; if (!r) continue;
    insT.run(exam.id, r.kp_id || null, r.attempt_id, it.source, it.from_lang || "", bg.target || exam.name, it.note || "");
    n++;
  }
  // 对照表去重(同 concept 已存在就跳过)
  const insC = db.prepare("INSERT INTO lang_contrast(exam_id,concept,native,l2,target,pitfall,kind) VALUES(?,?,?,?,?,?,?)");
  const existC = db.prepare(`SELECT concept FROM lang_contrast WHERE exam_id IN ${scSql}`).all().map((c) => (c.concept || "").trim());
  let cAdded = 0;
  for (const c of (out.contrast || [])) {
    if (!c.concept || existC.includes(c.concept.trim())) continue;
    insC.run(exam.id, c.concept, c.native || "", c.l2 || "", c.target || "", c.pitfall || "", c.kind || "negative");
    existC.push(c.concept.trim()); cAdded++;
  }
  return { analyzed: n, contrastAdded: cAdded };
}

// 学某主题前:根据语言背景预测可能的正/负迁移,提前提醒。
export async function predictTransfer(user, exam, topic) {
  const bg = getLangBackground(user.id);
  const bgStr = `母语=${bg.native || "未知"};已会外语=${(bg.known || []).join("、") || "无"};目标语=${bg.target || exam.name}`;
  const out = await generateJson(
    `考生语言背景:${bgStr}。ta 即将学习目标语的这个主题:「${topic}」。
基于语言迁移规律,预测:
- negatives:最可能踩的【负迁移】陷阱(母语或已会外语的习惯会带偏 ta 的地方),每条 {point, from(来自哪门语言), why}
- positives:可以【借力】的正迁移(已有语言能帮上忙的地方),每条 {point, from, why}
- tip:一句话总的学习提醒
只给确有语言学依据的,针对 ta 的具体语言组合。` + langInstruction(user.lang),
    { type: "object", properties: {
      negatives: { type: "array", items: { type: "object", properties: { point: { type: "string" }, from: { type: "string" }, why: { type: "string" } }, required: ["point"] } },
      positives: { type: "array", items: { type: "object", properties: { point: { type: "string" }, from: { type: "string" }, why: { type: "string" } }, required: ["point"] } },
      tip: { type: "string" },
    }, required: ["negatives", "positives"] }
  );
  return out;
}

export function transferSummary(exam) {
  const scSql = scopeSql(examScope(exam.id));
  const counts = {};
  for (const src of SOURCES) counts[src] = 0;
  try {
    const rows = db.prepare(`SELECT source, COUNT(*) n FROM lang_transfer WHERE exam_id IN ${scSql} GROUP BY source`).all();
    for (const r of rows) counts[r.source] = r.n;
  } catch {}
  let contrast = [], recent = [];
  try { contrast = db.prepare(`SELECT concept, native, l2, target, pitfall, kind FROM lang_contrast WHERE exam_id IN ${scSql} ORDER BY id DESC LIMIT 60`).all(); } catch {}
  try { recent = db.prepare(`SELECT source, from_lang, note FROM lang_transfer WHERE exam_id IN ${scSql} AND note<>'' ORDER BY id DESC LIMIT 12`).all(); } catch {}
  const total = SOURCES.reduce((a, s) => a + counts[s], 0);
  return { counts, total, contrast, recent };
}
