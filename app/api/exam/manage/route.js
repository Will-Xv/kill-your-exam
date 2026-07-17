import db, { purgeExam, getActiveExam } from "@/lib/db";
import { mapSubExamMasteryToFamily } from "@/lib/mastery";
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
    // 真子考试(有父)完成→前端据此询问:要不要把它的掌握度映射进家族知识树。
    return Response.json({ ok: true, isSubExam: !!e.parent_exam_id });
  }
  // 真子考试完成后:把它的掌握度语义映射到家族里其它考试(母+兄弟)的对应知识点。
  if (action === "map_mastery_to_family") {
    try { const r = await mapSubExamMasteryToFamily(examId); return Response.json(r); }
    catch (err) { return Response.json({ ok: false, reason: String(err && err.message || err) }, { status: 500 }); }
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
