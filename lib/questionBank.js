import crypto from "crypto";
import db from "@/lib/db";
import { generateJson, langInstruction } from "@/lib/gemini";

// 用户提供的题库:questions 表里 origin='fixed' 的题。可标记 must_include(每次必出)。
// 配合 exams.closed_bank(封闭题库):开启后练习和模拟都只从这些题出。

function keyOf(examId, stem) {
  return "fixed:" + crypto.createHash("sha1").update(examId + "|" + String(stem || "").trim()).digest("hex").slice(0, 24);
}

export function bankList(examId) {
  const rows = db.prepare("SELECT * FROM questions WHERE exam_id=? AND origin='fixed' ORDER BY must_include DESC, id ASC").all(examId);
  return rows.map((q) => {
    let body = {}, ans = {};
    try { body = JSON.parse(q.body); } catch {}
    try { ans = JSON.parse(q.answer); } catch {}
    return { id: q.id, qtype: q.qtype, stem: body.stem || "", options: body.options || [], answer: ans.answer || "", explanation: ans.explanation || "", must: !!q.must_include };
  });
}

// 新增/更新一道题库题(按题干去重,原样保存,一字不差)
export function bankAdd(examId, item) {
  const qtype = ["single", "multi", "judge", "fill", "short"].includes(item.qtype) ? item.qtype : "short";
  const stem = String(item.stem || "").trim();
  if (!stem) return null;
  const key = keyOf(examId, stem);
  const body = JSON.stringify({ stem, options: Array.isArray(item.options) ? item.options : [] });
  const answer = JSON.stringify({ answer: item.answer || "", explanation: item.explanation || "" });
  const must = item.must ? 1 : 0;
  const existing = db.prepare("SELECT id FROM questions WHERE exam_id=? AND fixed_key=?").get(examId, key);
  if (existing) {
    db.prepare("UPDATE questions SET qtype=?, body=?, answer=?, must_include=?, flagged=0 WHERE id=?").run(qtype, body, answer, must, existing.id);
    return existing.id;
  }
  const info = db.prepare("INSERT INTO questions(exam_id,kp_id,qtype,body,answer,difficulty,source_type,source_refs,origin,answer_origin,is_real,fixed_key,must_include) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(examId, null, qtype, body, answer, 2, "material", "[]", "fixed", "human", 1, key, must);
  return info.lastInsertRowid;
}

export function bankSetMust(examId, id, on) {
  db.prepare("UPDATE questions SET must_include=? WHERE id=? AND exam_id=? AND origin='fixed'").run(on ? 1 : 0, Number(id), examId);
}
export function bankDelete(examId, id) {
  db.prepare("DELETE FROM questions WHERE id=? AND exam_id=? AND origin='fixed'").run(Number(id), examId);
}
export function setClosedBank(examId, on) {
  db.prepare("UPDATE exams SET closed_bank=? WHERE id=?").run(on ? 1 : 0, examId);
}
export function isClosedBank(exam) { return !!(exam && exam.closed_bank); }

// 把用户粘贴的一大段文本解析成题库题(尽量一字不差),逐条入库。返回新增/更新的题数。
export async function bankParseText(exam, text, lang, markMust = false) {
  const t = String(text || "").trim();
  if (t.length < 4) return { added: 0 };
  const schema = { type: "object", properties: { questions: { type: "array", items: { type: "object", properties: {
    qtype: { type: "string", enum: ["single", "multi", "judge", "fill", "short"] },
    stem: { type: "string" }, options: { type: "array", items: { type: "string" } },
    answer: { type: "string" }, explanation: { type: "string" }
  }, required: ["qtype", "stem"] } } }, required: ["questions"] };
  const prompt = `下面是用户提供的【确定会考的原题】文本(可能是开卷考的考题、或指定的固定题库)。请把它【原样、一字不差】地拆解成结构化题目,【不要改写题干、不要替换措辞、不要自行编题】,只做格式整理:
- qtype: single(单选)/multi(多选)/judge(判断)/fill(填空)/short(简答),按题目实际形态判断。
- stem: 题干原文,一字不差。
- options: 选择题的选项,每个只写选项内容本身,不要带 "A." 前缀;判断/填空/简答留空数组。
- answer: 如果原文给了答案就照抄(选择题写字母如 "A"/"AC";判断写"对"/"错";填空/简答写答案原文);原文没给答案就留空字符串。
- explanation: 原文若有解析就照抄,没有就留空。
不要遗漏任何一道题,也不要凭空增加题。原文:
${t.slice(0, 12000)}` + langInstruction(lang);
  const out = await generateJson(prompt, schema, {});
  let added = 0;
  for (const q of (out.questions || [])) {
    const id = bankAdd(exam.id, { ...q, must: markMust });
    if (id) added++;
  }
  return { added };
}
