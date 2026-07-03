import db, { getActiveExam } from "@/lib/db";

export async function GET() {
  const exam = getActiveExam();
  if (!exam) return Response.json({ materials: [] });
  const materials = db.prepare(`SELECT m.*, (SELECT COUNT(*) FROM chunks c WHERE c.material_id=m.id) chunk_count
    FROM materials m WHERE exam_id=? ORDER BY id DESC`).all(exam.id);
  return Response.json({ materials, checklist: JSON.parse(exam.checklist || "[]") });
}

export async function PATCH(req) {
  // 更新资料清单勾选状态
  const { checklist } = await req.json();
  const exam = getActiveExam();
  if (exam && checklist) db.prepare("UPDATE exams SET checklist=? WHERE id=?").run(JSON.stringify(checklist), exam.id);
  return Response.json({ ok: true });
}
