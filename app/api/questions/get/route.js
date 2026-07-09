import db, { examScope, scopeSql } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";

// 取单道题(用于"重做这道题")
export async function GET(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ question: null });
  const id = Number(new URL(req.url).searchParams.get("id"));
  const q = db.prepare(`SELECT id, kp_id, qtype, body, difficulty FROM questions WHERE id=? AND exam_id IN ${scopeSql(examScope(exam.id))}`).get(id);
  if (!q) return Response.json({ question: null });
  let body = {}; try { body = JSON.parse(q.body); } catch {}
  return Response.json({ question: { id: q.id, kp_id: q.kp_id, qtype: q.qtype, body, difficulty: q.difficulty } });
}
