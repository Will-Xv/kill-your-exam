import db from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/auth";
export async function GET() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const exams = db.prepare(`SELECT id, name, exam_date, status FROM exams WHERE user_id=? ORDER BY (status='active') DESC, id DESC`).all(u.id);
  return Response.json({ exams });
}
