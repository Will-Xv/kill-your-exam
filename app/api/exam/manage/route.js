import db, { purgeExam, getActiveExam } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

export async function POST(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { action, examId, examDate } = await req.json();
  const e = db.prepare("SELECT * FROM exams WHERE id=?").get(examId);
  if (!e || e.user_id !== u.id) return forbidden();

  if (action === "complete") {
    // 只打“已完成”标记,不改 status、不自动切走——考试仍可选中/练习,只是不显示倒计时。
    db.prepare("UPDATE exams SET completed_at=datetime('now') WHERE id=?").run(examId);
    return Response.json({ ok: true });
  }
  if (action === "uncomplete") {
    db.prepare("UPDATE exams SET completed_at=NULL WHERE id=?").run(examId);
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
  if (action === "setDate") {
    db.prepare("UPDATE exams SET exam_date=? WHERE id=?").run(examDate || null, examId);
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
