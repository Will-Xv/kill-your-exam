import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { updateReviewQueue } from "@/lib/mastery";
import { maybeAutoUpdateOverall } from "@/lib/overall";

// 表演题「不会做」:计为不会(薄弱),返回评分要点/示范要点供学习。
export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const { questionId } = await req.json();
  const q = db.prepare("SELECT * FROM questions WHERE id=?").get(questionId);
  if (!q || !exam || q.exam_id !== exam.id) return forbidden();
  let ans = {}, body = {};
  try { ans = JSON.parse(q.answer); } catch {}
  try { body = JSON.parse(q.body); } catch {}
  db.prepare("INSERT INTO attempts(question_id,exam_id,kp_id,user_answer,correct,score,feedback,mode) VALUES(?,?,?,?,?,?,?,?)")
    .run(questionId, exam.id, q.kp_id, "[不会做]", 0, 0, "", "practice");
  updateReviewQueue(questionId, false);
  maybeAutoUpdateOverall(user);
  return Response.json({ ok: true, rubric: (ans.rubric && ans.rubric.length ? ans.rubric : body.rubric) || [], notes: ans.notes || "" });
}
