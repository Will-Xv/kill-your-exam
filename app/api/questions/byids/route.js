import db, { examScope, scopeSql } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";

// 按一组 id 取题(用于"上传做题"把识别出的题载进练习页)。保持传入 id 的顺序。
export async function GET(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ questions: [] });
  const raw = new URL(req.url).searchParams.get("ids") || "";
  const ids = raw.split(",").map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0).slice(0, 100);
  if (!ids.length) return Response.json({ questions: [] });
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT id, kp_id, qtype, body, difficulty, source_type, source_refs, origin, answer_origin, is_real FROM questions WHERE id IN (${placeholders}) AND exam_id IN ${scopeSql(examScope(exam.id))}`).all(...ids);
  const byId = new Map(rows.map((q) => { let body = {}; try { body = JSON.parse(q.body); } catch {} return [q.id, { id: q.id, kp_id: q.kp_id, qtype: q.qtype, body, difficulty: q.difficulty, source_type: q.source_type, source_refs: q.source_refs, origin: q.origin, answer_origin: q.answer_origin, is_real: q.is_real }]; }));
  const questions = ids.map((id) => byId.get(id)).filter(Boolean);   // 按传入顺序
  return Response.json({ questions });
}
