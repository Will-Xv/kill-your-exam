import db, { inScope } from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const { questionId, reason } = await req.json();
  const q = db.prepare("SELECT exam_id FROM questions WHERE id=?").get(questionId);
  if (!q || !exam || !inScope(exam.id, q.exam_id)) return forbidden();
  db.prepare("UPDATE questions SET flagged=1, flag_reason=? WHERE id=?").run(reason || "question", questionId);
  return Response.json({ ok: true });
}
