import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { generateJson, langInstruction } from "@/lib/gemini";
import { updateReviewQueue } from "@/lib/mastery";
import { aiErrorResponse } from "@/lib/errors";

export async function POST(req) {
  try {
    const { questionId, userAnswer, mode = "practice" } = await req.json();
    const q = db.prepare("SELECT * FROM questions WHERE id=?").get(questionId);
    if (!q) return Response.json({ error: "not found" }, { status: 404 });
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    if (!exam || q.exam_id !== exam.id) return forbidden();
    const ans = JSON.parse(q.answer);
    let correct, score, feedback = "";
    if (q.qtype === "short") {
      const g = await generateJson(
        `你是阅卷老师。题目:${JSON.parse(q.body).stem}
评分要点:${ans.answer}
考生答案:${userAnswer || "(未作答)"}
按要点给 0~100 分,并指出答对了什么、缺了什么。` + langInstruction(user.lang),
        {
          type: "object",
          properties: { score: { type: "integer" }, feedback: { type: "string" } },
          required: ["score", "feedback"]
        }
      );
      score = Math.max(0, Math.min(100, g.score));
      correct = score >= 60 ? 1 : 0;
      feedback = g.feedback;
    } else {
      const norm = (s) => String(s || "").replace(/[\s,，、]/g, "").toUpperCase();
      correct = norm(userAnswer) === norm(ans.answer) ? 1 : 0;
      if (q.qtype === "fill" && !correct) {
        // 填空宽松匹配:包含关系也算对
        const a = norm(ans.answer), u = norm(userAnswer);
        if (a && u && (a.includes(u) || u.includes(a)) && u.length >= Math.min(2, a.length)) correct = 1;
      }
      score = correct ? 100 : 0;
    }
    db.prepare("INSERT INTO attempts(question_id,exam_id,kp_id,user_answer,correct,score,feedback,mode) VALUES(?,?,?,?,?,?,?,?)")
      .run(questionId, exam.id, q.kp_id, String(userAnswer || ""), correct, score, feedback, mode);
    updateReviewQueue(questionId, !!correct);
    return Response.json({ correct: !!correct, score, feedback, answer: ans.answer, explanation: ans.explanation, source_type: q.source_type, source_refs: q.source_refs });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
