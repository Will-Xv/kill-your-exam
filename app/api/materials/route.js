import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ materials: [] });
  const materials = db.prepare(`SELECT m.*, (SELECT COUNT(*) FROM chunks c WHERE c.material_id=m.id) chunk_count
    FROM materials m WHERE exam_id=? ORDER BY id DESC`).all(exam.id);
  return Response.json({ materials, checklist: JSON.parse(exam.checklist || "[]") });
}

export async function PATCH(req) {
  // 更新资料清单勾选状态(onboarding 可传 examId)
  const { checklist, examId } = await req.json();
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  let targetId = exam?.id;
  if (examId) { const own = db.prepare("SELECT id FROM exams WHERE id=? AND user_id=?").get(examId, user.id); if (own) targetId = own.id; }
  if (targetId && checklist) db.prepare("UPDATE exams SET checklist=? WHERE id=?").run(JSON.stringify(checklist), targetId);
  return Response.json({ ok: true });
}
