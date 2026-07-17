import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { generateJson, langInstruction, attachParts, embed, cosine } from "@/lib/gemini";
import { leafKpList } from "@/lib/mastery";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 300;

// 上传文件做题:多模态识别文件里的每道题(题干/选项/答案),文件没给答案的让 AI 解出正确答案(为了能判分),
// 每道题语义就近绑到当前考试的一个知识点,入 questions 表。留住上传文件(File API parts)进 quiz_sessions,便于"重新识别"。
export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    if (!exam) return Response.json({ error: "no_exam" }, { status: 400 });
    const { attachments, text, reRecognize } = await req.json();

    let parts = [];
    let sess = null;
    if (reRecognize) {
      // 重新识别:复用上次那份上传文件(File API parts,约48h内有效)
      sess = db.prepare("SELECT * FROM quiz_sessions WHERE id=? AND user_id=?").get(Number(reRecognize), user.id);
      if (!sess) return Response.json({ error: "session_not_found" }, { status: 404 });
      try { parts = JSON.parse(sess.parts_json || "[]"); } catch { parts = []; }
      if (!parts.length) return Response.json({ error: "file_expired" }, { status: 410 });
    } else {
      try { parts = await attachParts(Array.isArray(attachments) ? attachments.slice(0, 6) : []); } catch {}
      if (!parts.length && !String(text || "").trim()) return Response.json({ error: "empty" }, { status: 400 });
    }

    const schema = { type: "object", properties: { questions: { type: "array", items: { type: "object", properties: {
      qtype: { type: "string", enum: ["single", "multi", "judge", "fill", "short"] },
      stem: { type: "string" }, options: { type: "array", items: { type: "string" } },
      answer: { type: "string" }, explanation: { type: "string" }, answerFromFile: { type: "boolean" }
    }, required: ["qtype", "stem", "answer"] } } }, required: ["questions"] };

    const prompt = `这是用户上传的一份【题目】文件/文本。请【识别出里面的每一道题】,一道不漏、也不要凭空增加。对每道题:
- qtype: single(单选)/multi(多选)/judge(判断)/fill(填空)/short(简答),按题目实际形态判断。
- stem: 题干原文,尽量一字不差(可去掉题号)。【必须是正常文字、单词之间保留空格】。数学用行内 $...$ 只包【公式本身】、且用正确 LaTeX(\\sqrt{}、^、\\frac{}{});【绝对不要把整句话或普通单词包进 $...$】——否则整段会挤成一坨公式。示例:好=「Find the mass above the cone $z=\\sqrt{x^2+y^2}$」;坏=「$Find the mass above the cone z=sqrt(x^2+y^2)$」。
- options: 选择题的每个选项内容(不要带 "A." 前缀);判断/填空/简答留空数组。
- answer: 【这道题的正确答案】。文件给了答案就照抄;【文件没给答案,你要自己把题解出来给出正确答案】(单/多选写字母如 "A"/"AC";判断写"对"/"错";填空/简答写正确答案原文)。这是为了之后给用户判分,所以 answer 绝不能空。
- explanation: 简短解析(有就照抄,没有就补一句为什么)。
- answerFromFile: 答案是不是【文件里本来就给了】——文件里给了标准答案就 true;文件没给、是你自己解出来的就 false。
${text ? "文本内容:\n" + String(text).slice(0, 12000) : "题目在随附的文件里(图片/PDF),请多模态识读。"}` + langInstruction(user.lang);

    const out = await generateJson(prompt, schema, { contents: [{ role: "user", parts: [{ text: prompt }, ...parts] }] });
    const list = Array.isArray(out.questions) ? out.questions : [];

    // 重新识别:把上一版里【没作答过】的题清掉(去掉识别错的旧题,不动已作答的)
    if (sess) {
      try {
        const oldIds = JSON.parse(sess.question_ids_json || "[]");
        for (const oid of oldIds) {
          const hasAtt = db.prepare("SELECT 1 FROM attempts WHERE question_id=? LIMIT 1").get(oid);
          if (!hasAtt) { try { db.prepare("DELETE FROM questions WHERE id=? AND exam_id=?").run(oid, exam.id); } catch {} }
        }
      } catch {}
    }

    if (!list.length) return Response.json({ ok: true, count: 0, questions: [], sessionId: sess ? sess.id : null });

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
        const ansOrigin = q.answerFromFile ? "provided" : "ai";   // provided=文件里给的, ai=AI解出的
        const info = db.prepare("INSERT INTO questions(exam_id,kp_id,qtype,body,answer,difficulty,source_type,source_refs,origin,answer_origin,is_real) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
          .run(exam.id, kpId, qtype, body, answer, 2, "material", "[]", "upload", ansOrigin, 1);
        const kpTitle = kpId ? (db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(kpId)?.title || "") : "";
        created.push({ id: info.lastInsertRowid, qtype, stem, options: Array.isArray(q.options) ? q.options : [], kpId, kpTitle });
      } catch {}
    }

    const ids = created.map((c) => c.id);
    let sessionId = sess ? sess.id : null;
    if (sess) {
      db.prepare("UPDATE quiz_sessions SET question_ids_json=? WHERE id=?").run(JSON.stringify(ids), sess.id);
    } else {
      const info = db.prepare("INSERT INTO quiz_sessions(exam_id,user_id,parts_json,question_ids_json) VALUES(?,?,?,?)")
        .run(exam.id, user.id, JSON.stringify(parts), JSON.stringify(ids));
      sessionId = info.lastInsertRowid;
    }
    return Response.json({ ok: true, count: created.length, questions: created, sessionId });
  } catch (e) { return aiErrorResponse(e); }
}
