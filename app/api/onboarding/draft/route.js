import db from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

// 读取「设置中」草稿,供 onboarding 续填
export async function GET(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const examId = Number(new URL(req.url).searchParams.get("examId"));
  const e = db.prepare("SELECT * FROM exams WHERE id=? AND deleted_at IS NULL").get(examId);
  if (!e) return Response.json({ error: "not found" }, { status: 404 });
  if (e.user_id !== u.id) return forbidden();
  let report = null, sources = [];
  try { const sa = JSON.parse(e.self_assessment || "null"); if (sa) { const { sources: src, ...rest } = sa; report = rest; sources = src || []; } } catch {}
  let checklist = []; try { checklist = JSON.parse(e.checklist || "[]"); } catch {}
  return Response.json({
    examId: e.id, name: e.name || "", examType: e.exam_type || "", examDate: e.exam_date || "",
    dailyMinutes: e.daily_minutes || 60, school: e.school || "", notes: e.notes || "",
    setupState: e.setup_state || null, report, sources, checklist,
  });
}
