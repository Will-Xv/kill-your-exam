import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const { questionId } = await req.json();
  const q = db.prepare("SELECT exam_id FROM questions WHERE id=?").get(questionId);
  if (!q || !exam || q.exam_id !== exam.id) return forbidden();
  db.prepare("UPDATE questions SET flagged=1 WHERE id=?").run(questionId);
  return Response.json({ ok: true });
}
