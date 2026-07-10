import db, { purgeExpiredExams } from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/auth";
export async function GET() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  purgeExpiredExams();
  const exams = db.prepare(`SELECT id, name, exam_date, status, setup_state, setup_progress, completed_at, deleted_at FROM exams WHERE user_id=? ORDER BY (status='active' AND deleted_at IS NULL) DESC, deleted_at IS NOT NULL, id DESC`).all(u.id);
  return Response.json({ exams });
}
