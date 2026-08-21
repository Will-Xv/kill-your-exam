// 【上传即抽题】(2026-08,Will 定)
//
// 治本的做法:资料一上传就把里面【现成的题】抄进题库,而不是等到用户点「做原题」时才现抄。
// 好处有三:
//   1. 题库不再骗人 —— 传了卷子,「我的题库」当场就有题,不用先去做一遍原题才出现;
//   2. 只花一次钱 —— 以后做原题、组卷、翻题库都是直接读库,不再重复解析同一份文件;
//   3. 抽出来的题天然带着 material_id,谁是从哪份卷子来的一清二楚。
//
// 【怎么不浪费钱】建索引那次调用本来就要整份读一遍原件,顺手让它回答一句"这文件里有没有成套的题",
// 结果记进 materials.has_questions。只有 =1 的才再花一次钱把题抄出来;讲义/笔记类零额外开销。
//
// 抄题规格和「上传做题」是同一套(那条路已经跑熟):原样搬、不改写、大题带小问不拆开、没题就返回空。
import crypto from "crypto";
import fs from "fs";
import db from "@/lib/db";
import { generateJson, langInstruction, uploadMedia, embed, cosine } from "@/lib/gemini";
import { matPath } from "@/lib/files";
import { leafKpList } from "@/lib/mastery";

// 题的指纹:同一份资料里同一道题只入库一次(重复上传/重复触发都不会重)
export function paperKey(materialId, stem) {
  return `mat${materialId}:` + crypto.createHash("sha1").update(String(stem).replace(/\s+/g, "").slice(0, 200)).digest("hex").slice(0, 16);
}
export function extractedFor(examId, materialId) {
  return db.prepare("SELECT * FROM questions WHERE exam_id=? AND flagged=0 AND fixed_key LIKE ? ORDER BY id ASC").all(examId, `mat${materialId}:%`);
}

export const extractSchema = { type: "object", properties: { questions: { type: "array", items: { type: "object", properties: {
  qtype: { type: "string", enum: ["single", "multi", "judge", "fill", "short"] },
  stem: { type: "string" }, options: { type: "array", items: { type: "string" } },
  answer: { type: "string" }, explanation: { type: "string" }, difficulty: { type: "integer" },
  answerFromFile: { type: "boolean" }, isPastPaper: { type: "boolean" }
}, required: ["qtype", "stem", "answer", "explanation"] } } }, required: ["questions"] };

export function extractPrompt(request, lang) {
  return `这是一份【卷子/题目】文件。请把里面的每一道题【原样识别出来】,一道不漏,也【绝对不要自己新编题目】。

★【最高红线 · 原样搬运】题干、选项都要照抄原文,一字不差(可以去掉题号)。
  不要改写、不要"润色"、不要换数字、不要把两道题合并成一道、更不要凭空补一道原文没有的题。
  文件里没有题(是讲义、课本、笔记之类)就返回空数组 —— 空着是正确答案,编题才是错。

★【一道大题下面有多个小问的,算【一道题】,绝对不要拆开】——这是最容易出错的地方。
  典型形态:「3. 设 f(x)=… (1) 求… (2) 求… (3) 证明…」,或「阅读下面材料,回答问题:①… ②…」。
  拆开会出大事:小问离开了大题主干(那个"设 f(x)=…"、那段材料、那张图表)就【看不懂、也没法作答】。
  正确做法:把【大题主干 + 全部小问】原样合并进【同一个 stem】,保留 (1)(2)(3) 的编号;
  ★各小问之间用【空行】隔开(写成 "…主干…\\n\\n(1) …\\n\\n(2) …"),因为 Markdown 里单个换行不会换行。
  qtype 取能覆盖整题的那种(通常是 short);answer 按同样的编号逐条列全、同样用空行隔开。

对每道题:
- qtype: single(单选)/multi(多选)/judge(判断)/fill(填空)/short(简答),按题目实际形态判断。
- stem: 题干原文。【必须是正常文字、单词之间保留空格】。数学用行内 $...$ 只包【公式本身】、且用正确 LaTeX(\\sqrt{}、^、\\frac{}{});【绝对不要把整句话或普通单词包进 $...$】。
- options: 选择题的每个选项内容(不要带 "A." 前缀);判断/填空/简答留空数组。
- answer: 这道题的正确答案。文件给了答案就照抄;【文件没给答案,你要自己把题解出来】(单/多选写字母如 "A"/"AC";判断写"对"/"错")。要给用户判分用,绝不能空。
- explanation: 简短解析,每道题都要有(原文有就照抄,没有就自己补;选择题说明正确项为什么对、其他项错在哪)。
- answerFromFile: 答案是不是文件里本来就给了(给了 true;你自己解出来的 false)。
- isPastPaper: 这份文件看着是不是【历年真题/正式考卷】(有年份、考试名称、正式卷头等)。像模拟卷、练习册、习题集就填 false,不要拔高。
- difficulty: 1~3。
${request && String(request).trim() ? `\n★【只挑符合这个要求的题 · 优先遵守】${String(request).slice(0, 600)}\n仍然是原样搬运,不因为这个要求而改写或新编。` : ""}` + langInstruction(lang);
}

// 把一份资料里的题抄进题库。返回入库条数。已经抄过的直接返回现有条数,不重复花钱。
// 纯文本资料的粗筛:像不像一份题目文件。目的是【别让讲义白花一次调用】。
// 判据是最朴素的排版特征:成串的题号行,或成组的 A/B/C/D 选项。宁可漏判(漏了还有做原题时的兜底),
// 也不要见文本就抽 —— 那才是乱花钱。
export function looksLikeQuestions(text) {
  const t = String(text || "");
  if (t.length < 120) return false;
  const numbered = (t.match(/^[\s　]*\d{1,3}\s*[.、)．]/gm) || []).length;
  const optionSets = (t.match(/(^|\n)[\s　]*[A-DA-D][.、)．][^\n]{0,80}\n[\s　]*[B-DB-D][.、)．]/g) || []).length;
  const marks = (t.match(/[((]\s*\d{1,2}\s*分\s*[))]/g) || []).length;
  return numbered >= 5 || optionSets >= 2 || marks >= 3;
}

export async function extractQuestionsFromMaterial(materialId, examId, lang, { request = "", force = false, text = "" } = {}) {
  const m = db.prepare("SELECT * FROM materials WHERE id=?").get(materialId);
  if (!m) return 0;
  const done = extractedFor(examId, materialId);
  if (done.length && !force) return done.length;
  const txt = String(text || "").trim();
  if (!txt && !(m.status === "ready" && m.stored)) return 0;

  // 有现成文本(docx/txt/网页等)就直接拿文本抽,不必再读一遍原件 —— 便宜一个数量级
  let part = null;
  let buf = null;
  if (!txt) {
  try { buf = fs.readFileSync(matPath(materialId)); } catch { return 0; }
  if (!buf.length) return 0;

  try {
    const ext = /pdf/i.test(m.mime || "") ? "pdf" : /png/i.test(m.mime || "") ? "png" : "jpg";
    const up = await uploadMedia(buf, m.mime || "application/pdf", ext);
    part = { fileData: { fileUri: up.fileUri, mimeType: up.mimeType } };
  } catch {
    if (buf.length <= 14 * 1024 * 1024) part = { inlineData: { mimeType: m.mime || "application/pdf", data: buf.toString("base64") } };
    else return 0;
  }
  }

  const prompt = extractPrompt(request, lang) + (txt ? `\n\n【文件内容】\n${txt.slice(0, 60000)}` : "");
  let list = [];
  try {
    const res = await generateJson(prompt, extractSchema,
      part ? { contents: [{ role: "user", parts: [{ text: prompt }, part] }] } : {});
    list = Array.isArray(res.questions) ? res.questions : [];
  } catch { return 0; }

  // 抄完就记账:没题也记(questions_extracted=1),免得反复重试同一份讲义
  try { db.prepare("UPDATE materials SET questions_extracted=1, has_questions=? WHERE id=?").run(list.length ? 1 : 0, materialId); } catch {}
  if (!list.length) return 0;

  const kps = (() => { try { return leafKpList(examId); } catch { return []; } })();
  let kv = []; if (kps.length) { try { kv = await embed(kps.map((k) => k.title)); } catch {} }

  const ins = db.prepare(`INSERT INTO questions(exam_id,kp_id,qtype,body,answer,difficulty,source_type,source_refs,origin,answer_origin,is_real,fixed_key)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  let n = 0;
  for (const q of list) {
    const stem = String(q.stem || "").trim();
    if (!stem) continue;
    const key = paperKey(materialId, stem);
    if (db.prepare("SELECT id FROM questions WHERE exam_id=? AND fixed_key=?").get(examId, key)) continue;
    let kpId = null;
    if (kv.length) {
      try { const [qv] = await embed([stem.slice(0, 200)]); let best = -1, bi = -1; kv.forEach((v, i) => { const sc = cosine(qv, v); if (sc > best) { best = sc; bi = i; } }); if (bi >= 0) kpId = kps[bi].id; } catch {}
    }
    const qtype = ["single", "multi", "judge", "fill", "short"].includes(q.qtype) ? q.qtype : "short";
    const body = JSON.stringify({ stem, options: Array.isArray(q.options) ? q.options : [] });
    const ans = JSON.stringify({ answer: String(q.answer || ""), explanation: String(q.explanation || "") });
    // origin='fixed' → 这道题会出现在「我的题库」面板里(和手动录入的一视同仁)。
    // is_real 只在文件确实是历年真题时置 1:真题才配被模拟考反复抽,模拟卷/练习册不冒充。
    try {
      ins.run(examId, kpId, qtype, body, ans, q.difficulty || 2, "material",
        JSON.stringify([{ material_id: materialId, filename: m.filename }]), "fixed",
        q.answerFromFile ? "provided" : "ai", q.isPastPaper ? 1 : 0, key);
      n++;
    } catch {}
  }
  return n;
}

// 上传/补索引之后调用:该抽就抽,不该抽就跳过。永远不抛错、不阻塞调用方。
export async function maybeExtractQuestions(materialId, examId, lang) {
  try {
    const m = db.prepare("SELECT has_questions, questions_extracted FROM materials WHERE id=?").get(materialId);
    if (!m || m.questions_extracted) return 0;
    if (m.has_questions !== 1) return 0;            // 建索引时判定"没有成套的题"→ 一分钱不花
    return await extractQuestionsFromMaterial(materialId, examId, lang);
  } catch { return 0; }
}
