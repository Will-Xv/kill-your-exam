import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ tree: [] });
  const rows = db.prepare("SELECT * FROM knowledge_points WHERE exam_id=? ORDER BY sort").all(exam.id);
  const chapters = rows.filter((r) => !r.parent_id).map((ch) => ({
    ...ch,
    points: rows.filter((r) => r.parent_id === ch.id).map((p) => {
      const stat = db.prepare("SELECT COUNT(*) n, SUM(correct) c FROM attempts WHERE kp_id=?").get(p.id);
      return { ...p, attempts: stat.n || 0, correct: stat.c || 0 };
    })
  }));
  return Response.json({ tree: chapters });
}
