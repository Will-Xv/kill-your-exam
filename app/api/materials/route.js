import db, { familyScope, scopeSql } from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ materials: [] });
  const scope = familyScope(exam.id);
  const rows = db.prepare(`SELECT m.*, (SELECT COUNT(*) FROM chunks c WHERE c.material_id=m.id) chunk_count
    FROM materials m WHERE m.exam_id IN ${scopeSql(scope)} ORDER BY (m.exam_id=${Number(exam.id)}) DESC, m.id DESC`).all();
  const nameById = {}; for (const id of scope) nameById[id] = db.prepare("SELECT name FROM exams WHERE id=?").get(id)?.name || "";
  const materials = rows.map((m) => ({ ...m, shared: m.exam_id !== exam.id, fromExamName: m.exam_id !== exam.id ? (nameById[m.exam_id] || "") : "" }));
  return Response.json({ materials, checklist: JSON.parse(exam.checklist || "[]") });
}

export async function PATCH(req) {
  // 更新资料清单勾选状态(onboarding 可传 examId)
  const { checklist, examId, confirmMaterialId } = await req.json();
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  // 【主人确认这份资料就是本考试的 → 清掉"疑似不符/不确定/超范围"标记】
  // 自动判定按抽出的文件内容判,扫描件抽不出字就 unsure;主人一句"这是本考试的"应当能一键消掉。
  if (confirmMaterialId) {
    const m = db.prepare("SELECT m.id FROM materials m JOIN exams e ON e.id=m.exam_id WHERE m.id=? AND e.user_id=?").get(Number(confirmMaterialId), user.id);
    if (!m) return forbidden();
    db.prepare("UPDATE materials SET offtopic=0, offtopic_reason=NULL WHERE id=?").run(Number(confirmMaterialId));
    return Response.json({ ok: true });
  }
  let targetId = exam?.id;
  if (examId) { const own = db.prepare("SELECT id FROM exams WHERE id=? AND user_id=?").get(examId, user.id); if (own) targetId = own.id; }
  if (targetId && checklist) db.prepare("UPDATE exams SET checklist=? WHERE id=?").run(JSON.stringify(checklist), targetId);
  return Response.json({ ok: true });
}
