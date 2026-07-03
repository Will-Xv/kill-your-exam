import db from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
export async function POST(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { examId } = await req.json();
  const e = db.prepare("SELECT * FROM exams WHERE id=?").get(examId);
  if (!e || e.user_id !== u.id) return forbidden();
  db.prepare("UPDATE exams SET status='archived' WHERE user_id=? AND status='active'").run(u.id);
  db.prepare("UPDATE exams SET status='active' WHERE id=?").run(examId);
  return Response.json({ ok: true });
}
