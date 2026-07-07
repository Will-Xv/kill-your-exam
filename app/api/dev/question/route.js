import db from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

// 开发者:检查/修复某道题(直接看/改原始 JSON、标记问题、删除)
export async function GET(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  if (!u.is_developer) return forbidden();
  const id = Number(new URL(req.url).searchParams.get("id"));
  const q = db.prepare("SELECT * FROM questions WHERE id=?").get(id);
  if (!q) return Response.json({ error: "not found" }, { status: 404 });
  const kp = q.kp_id ? db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(q.kp_id)?.title : null;
  const attempts = db.prepare("SELECT COUNT(*) n FROM attempts WHERE question_id=?").get(id).n;
  return Response.json({ question: { id: q.id, exam_id: q.exam_id, kp_id: q.kp_id, kpTitle: kp, qtype: q.qtype, flagged: !!q.flagged, origin: q.origin, is_real: !!q.is_real, difficulty: q.difficulty, attempts, body: q.body, answer: q.answer } });
}

export async function POST(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  if (!u.is_developer) return forbidden();
  const { id, action, body, answer } = await req.json();
  const q = db.prepare("SELECT * FROM questions WHERE id=?").get(id);
  if (!q) return Response.json({ error: "not found" }, { status: 404 });
  if (action === "save") {
    try { JSON.parse(body); JSON.parse(answer); } catch { return Response.json({ error: "body/answer 不是合法 JSON" }, { status: 400 }); }
    db.prepare("UPDATE questions SET body=?, answer=? WHERE id=?").run(body, answer, id);
  } else if (action === "flag") db.prepare("UPDATE questions SET flagged=1 WHERE id=?").run(id);
  else if (action === "unflag") db.prepare("UPDATE questions SET flagged=0 WHERE id=?").run(id);
  else if (action === "delete") db.prepare("DELETE FROM questions WHERE id=?").run(id);
  return Response.json({ ok: true });
}
