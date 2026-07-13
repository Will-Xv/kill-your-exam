import db, { getActiveExam } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { crossExamPlan } from "@/lib/planner";

export async function GET(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const url = new URL(req.url);
  const totalMinutes = Number(url.searchParams.get("minutes")) || undefined;
  const mode = url.searchParams.get("mode") || undefined;
  let dbg = null;
  if (url.searchParams.get("debug")) {
    try {
      const active = getActiveExam(user.id);
      const byUser = db.prepare("SELECT COUNT(*) c FROM exams WHERE user_id=? AND deleted_at IS NULL").get(user.id).c;
      const topByUser = db.prepare("SELECT COUNT(*) c FROM exams WHERE user_id=? AND parent_exam_id IS NULL AND deleted_at IS NULL").get(user.id).c;
      const sample = db.prepare("SELECT id,name,user_id,parent_exam_id,status,setup_state FROM exams WHERE user_id=? ORDER BY id DESC LIMIT 5").all(user.id);
      dbg = { userId: user.id, activeExamId: active?.id, activeUserId: active?.user_id, byUser, topByUser, sample };
    } catch (e) { dbg = { err: String(e && e.message || e) }; }
  }
  try { const p = crossExamPlan(user.id, { totalMinutes, mode }); return Response.json(dbg ? { ...p, _dbg: dbg } : p); }
  catch (e) { return Response.json({ exams: [], totalMinutes: totalMinutes || 90, topTask: null, examCount: 0, _err: String(e && e.message || e), _dbg: dbg }); }
}
