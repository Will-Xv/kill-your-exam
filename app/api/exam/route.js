import db, { getDocument } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ exam: null });
  const kpCount = db.prepare("SELECT COUNT(*) n FROM knowledge_points WHERE exam_id=?").get(exam.id).n;
  const matCount = db.prepare("SELECT COUNT(*) n FROM materials WHERE exam_id=? AND status='ready'").get(exam.id).n;
  const attempts = db.prepare("SELECT COUNT(*) n, SUM(correct) c FROM attempts WHERE exam_id=?").get(exam.id);
  const today = db.prepare("SELECT COUNT(*) n FROM attempts WHERE exam_id=? AND date(created_at)=date('now','localtime')").get(exam.id).n;
  return Response.json({
    exam: { ...exam, self_assessment: safeJson(exam.self_assessment), checklist: safeJson(exam.checklist) },
    stats: { kpCount, matCount, attemptCount: attempts.n || 0, correctCount: attempts.c || 0, todayCount: today },
    docs: {
      dossier: getDocument(exam.id, "dossier")?.content_md || "",
      strategy: getDocument(exam.id, "strategy")?.content_md || "",
      progress: getDocument(exam.id, "progress")?.content_md || ""
    }
  });
}
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
