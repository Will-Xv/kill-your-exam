import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { generateJson, generate, langInstruction, attachParts } from "@/lib/gemini";
import { mmOpts, materialParts } from "@/lib/rag";
import { saveMockAtt } from "@/lib/files";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 300;

export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    const { mockId, answers, attachments = {} } = await req.json(); // answers: {qid: text}; attachments: {qid: [{name,mime,data}]}
    const mock = db.prepare("SELECT * FROM mock_exams WHERE id=?").get(mockId);
    if (!mock || mock.exam_id !== exam?.id) return forbidden();
    const ids = JSON.parse(mock.config_json).questionIds;
    let total = 0, got = 0;
    const byChapter = {};
    const results = [];
    const answersOut = [];
    const norm = (s) => String(s || "").replace(/[\s,，、]/g, "").toUpperCase();
    for (const qid of ids) {
      const q = db.prepare("SELECT * FROM questions WHERE id=?").get(qid);
      if (!q) continue;
      const ans = JSON.parse(q.answer);
      const ua = answers[qid];
      let correct = 0;
      if (q.qtype === "short") {
        const ap = attachParts(attachments[qid]);
        const gradePrompt = `阅卷。题目:${JSON.parse(q.body).stem}\n评分要点:${ans.answer}\n考生答案:${ua || (ap.length ? "(见附件:手写/上传作答,请先识别其中内容)" : "(未答)")}\n给0~100分。(如题目涉及附件音频/图片,请结合附件评分)` + langInstruction(user.lang);
        const gradeSchema = { type: "object", properties: { score: { type: "integer" } }, required: ["score"] };
        let g;
        if (ap.length) {
          const mp = materialParts(exam.id, { max: 4 });
          const res = await generate(null, { contents: [{ role: "user", parts: [{ text: gradePrompt }, ...ap, ...mp] }], jsonSchema: gradeSchema });
          g = JSON.parse(res.text);
        } else {
          g = await generateJson(gradePrompt, gradeSchema, mmOpts(exam.id, gradePrompt));
        }
        correct = (g.score || 0) >= 60 ? 1 : 0;
      } else correct = norm(ua) === norm(ans.answer) ? 1 : 0;
      total++; got += correct;
      results.push({ id: qid, qtype: q.qtype, correct, answer: ans.answer, explanation: ans.explanation || "" });
      const insA = db.prepare("INSERT INTO attempts(question_id,exam_id,kp_id,user_answer,correct,score,mode) VALUES(?,?,?,?,?,?,'exam')")
        .run(qid, exam.id, q.kp_id, String(ua || ""), correct, correct ? 100 : 0);
      const attemptId = insA.lastInsertRowid;
      const atts = Array.isArray(attachments[qid]) ? attachments[qid] : [];
      if (atts.length) { try { saveMockAtt(attemptId, atts); } catch {} }
      const qbody = JSON.parse(q.body);
      answersOut.push({ qid, attemptId, qtype: q.qtype, stem: qbody.stem || "", options: qbody.options || [], ua: String(ua || ""), correct, answer: ans.answer, explanation: ans.explanation || "", atts: atts.map((a) => ({ name: a.name, mime: a.mime })) });
      const ch = q.kp_id ? (db.prepare("SELECT ch.title FROM knowledge_points kp LEFT JOIN knowledge_points ch ON ch.id=kp.parent_id WHERE kp.id=?").get(q.kp_id)?.title || "其他") : "其他";
      byChapter[ch] = byChapter[ch] || { total: 0, got: 0 };
      byChapter[ch].total++; byChapter[ch].got += correct;
    }
    const score = { total, got, pct: total ? Math.round((got / total) * 100) : 0, byChapter };
    db.prepare("UPDATE mock_exams SET score_json=?, answers_json=? WHERE id=?").run(JSON.stringify(score), JSON.stringify(answersOut), mockId);
    return Response.json({ score, results });
  } catch (e) { return aiErrorResponse(e); }
}
