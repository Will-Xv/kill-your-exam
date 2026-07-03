import db, { purgeExam, getActiveExam } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export async function POST(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { action, examId } = await req.json();
  const e = db.prepare("SELECT * FROM exams WHERE id=?").get(examId);
  if (!e || e.user_id !== u.id) return forbidden();

  if (action === "complete") {
    db.prepare("UPDATE exams SET status='completed' WHERE id=?").run(examId);
    // 若删的是当前考试,自动切到另一门未删除的
    if (e.status === "active") {
      const next = db.prepare("SELECT id FROM exams WHERE user_id=? AND deleted_at IS NULL AND id!=? ORDER BY id DESC LIMIT 1").get(u.id, examId);
      if (next) db.prepare("UPDATE exams SET status='active' WHERE id=?").run(next.id);
    }
    return Response.json({ ok: true });
  }
  if (action === "delete") {
    db.prepare("UPDATE exams SET deleted_at=datetime('now'), status='archived' WHERE id=?").run(examId);
    if (e.status === "active") {
      const next = db.prepare("SELECT id FROM exams WHERE user_id=? AND deleted_at IS NULL AND id!=? ORDER BY id DESC LIMIT 1").get(u.id, examId);
      if (next) db.prepare("UPDATE exams SET status='active' WHERE id=?").run(next.id);
    }
    return Response.json({ ok: true });
  }
  if (action === "restore") {
    db.prepare("UPDATE exams SET deleted_at=NULL WHERE id=?").run(examId);
    return Response.json({ ok: true });
  }
  if (action === "purge_now") {
    if (!e.deleted_at) return Response.json({ error: "not deleted" }, { status: 400 });
    purgeExam(examId);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
