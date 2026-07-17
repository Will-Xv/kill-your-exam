import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { generateJson, langInstruction, attachParts, embed, cosine } from "@/lib/gemini";
import { leafKpList } from "@/lib/mastery";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 300;

// 上传文件做题:多模态识别文件里的每道题(题干/选项/答案),文件没给答案的让 AI 解出正确答案(为了能判分),
// 每道题语义就近绑到当前考试的一个知识点,入 questions 表。之后用现成的 /api/questions/answer 作答→掌握度自动记进那个知识点。
export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    if (!exam) return Response.json({ error: "no_exam" }, { status: 400 });
    const { attachments, text } = await req.json();

    const parts = [];
    try { const ap = await attachParts(Array.isArray(attachments) ? attachments.slice(0, 6) : []); parts.push(...ap); } catch {}
    if (!parts.length && !String(text || "").trim()) return Response.json({ error: "empty" }, { status: 400 });

    const schema = { type: "object", properties: { questions: { type: "array", items: { type: "object", properties: {
      qtype: { type: "string", enum: ["single", "multi", "judge", "fill", "short"] },
      stem: { type: "string" }, options: { type: "array", items: { type: "string" } },
      answer: { type: "string" }, explanation: { type: "string" }
    }, required: ["qtype", "stem", "answer"] } } }, required: ["questions"] };

    const prompt = `这是用户上传的一份【题目】文件/文本。请【识别出里面的每一道题】,一道不漏、也不要凭空增加。对每道题:
- qtype: single(单选)/multi(多选)/judge(判断)/fill(填空)/short(简答),按题目实际形态判断。
- stem: 题干原文,尽量一字不差(可去掉题号)。【必须是正常文字、单词之间保留空格】。数学用行内 $...$ 只包【公式本身】、且用正确 LaTeX(\\sqrt{}、^、\\frac{}{});【绝对不要把整句话或普通单词包进 $...$】——否则整段会挤成一坨公式。示例:好=「Find the mass above the cone $z=\\sqrt{x^2+y^2}$」;坏=「$Find the mass above the cone z=sqrt(x^2+y^2)$」。
- options: 选择题的每个选项内容(不要带 "A." 前缀);判断/填空/简答留空数组。
- answer: 【这道题的正确答案】。文件给了答案就照抄;【文件没给答案,你要自己把题解出来给出正确答案】(单/多选写字母如 "A"/"AC";判断写"对"/"错";填空/简答写正确答案原文)。这是为了之后给用户判分,所以 answer 绝不能空。
- explanation: 简短解析(有就照抄,没有就补一句为什么)。
${text ? "文本内容:\n" + String(text).slice(0, 12000) : "题目在随附的文件里(图片/PDF),请多模态识读。"}` + langInstruction(user.lang);

    const out = await generateJson(prompt, schema, { contents: [{ role: "user", parts: [{ text: prompt }, ...parts] }] });
    const list = Array.isArray(out.questions) ? out.questions : [];
    if (!list.length) return Response.json({ ok: true, count: 0, questions: [] });

    const kps = (() => { try { return leafKpList(exam.id); } catch { return []; } })();
    let kv = [];
    try { if (kps.length) kv = await embed(kps.map((k) => k.title)); } catch {}

    const created = [];
    for (const q of list) {
      const stem = String(q.stem || "").trim();
      if (!stem) continue;
      let kpId = null;
      if (kps.length && kv.length) {
        try { const [qv] = await embed([stem.slice(0, 200)]); let best = -1, bi = -1; kv.forEach((v, i) => { const sc = cosine(qv, v); if (sc > best) { best = sc; bi = i; } }); if (bi >= 0) kpId = kps[bi].id; } catch {}
      }
      const qtype = ["single", "multi", "judge", "fill", "short"].includes(q.qtype) ? q.qtype : "short";
      const body = JSON.stringify({ stem, options: Array.isArray(q.options) ? q.options : [] });
      const answer = JSON.stringify({ answer: String(q.answer || ""), explanation: String(q.explanation || "") });
      try {
        const info = db.prepare("INSERT INTO questions(exam_id,kp_id,qtype,body,answer,difficulty,source_type,source_refs,origin,answer_origin,is_real) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
          .run(exam.id, kpId, qtype, body, answer, 2, "material", "[]", "upload", "human", 1);
        const kpTitle = kpId ? (db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(kpId)?.title || "") : "";
        created.push({ id: info.lastInsertRowid, qtype, stem, options: Array.isArray(q.options) ? q.options : [], kpId, kpTitle });
      } catch {}
    }
    return Response.json({ ok: true, count: created.length, questions: created });
  } catch (e) { return aiErrorResponse(e); }
}
