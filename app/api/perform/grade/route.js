import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { generate, langInstruction } from "@/lib/gemini";
import { aiErrorResponse } from "@/lib/errors";
import { saveRec } from "@/lib/files";

export const maxDuration = 300;

export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const form = await req.formData();
  const questionId = Number(form.get("questionId"));
  const file = form.get("recording");
  const q = db.prepare("SELECT * FROM questions WHERE id=?").get(questionId);
  if (!q || !exam || q.exam_id !== exam.id) return forbidden();
  if (!file) return Response.json({ error: "没有录制文件" }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!buffer.length) return Response.json({ error: "录制为空" }, { status: 400 });
  if (buffer.length > 18 * 1024 * 1024) return Response.json({ error: "录制文件过大(建议缩短或降清晰度,上限约 18MB)" }, { status: 400 });

  const body = JSON.parse(q.body || "{}");
  const ans = JSON.parse(q.answer || "{}");
  const rubric = (ans.rubric && ans.rubric.length ? ans.rubric : body.rubric) || [];
  const mime = file.type || (body.captureType === "video" ? "video/webm" : "audio/webm");
  try {
    const gradePrompt = `你是这门表演/技能类考试的评委。\n命题:${body.stem}\n评分维度:${rubric.join("、") || "综合表现"}\n${ans.notes ? "评分/示范要点:" + ans.notes + "\n" : ""}下面附件是考生的${body.captureType === "video" ? "表演录像" : "录音"}。请:1) 按每个评分维度逐条点评(先说亮点,再说可改进);2) 给一个 0~100 的综合分;3) 给 2~3 条具体、可立即练习的改进建议。开头一句提醒:这是 AI 辅助点评,仅供练习参考,不代表专业评委的权威评分。` + langInstruction(user.lang);
    const schema = { type: "object", properties: { score: { type: "integer" }, feedback: { type: "string" } }, required: ["score", "feedback"] };
    const res = await generate(null, { contents: [{ role: "user", parts: [{ text: gradePrompt }, { inlineData: { mimeType: mime, data: buffer.toString("base64") } }] }], jsonSchema: schema });
    const g = JSON.parse(res.text);
    const score = Math.max(0, Math.min(100, g.score || 0));
    const info = db.prepare("INSERT INTO attempts(question_id,exam_id,kp_id,user_answer,correct,score,feedback,mode) VALUES(?,?,?,?,?,?,?,?)")
      .run(questionId, exam.id, q.kp_id, "[表演录制]", score >= 60 ? 1 : 0, score, g.feedback, "practice");
    try { saveRec(info.lastInsertRowid, buffer); } catch {}
    return Response.json({ score, feedback: g.feedback, attemptId: info.lastInsertRowid, mime });
  } catch (e) { return aiErrorResponse(e); }
}
