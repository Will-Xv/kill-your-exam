import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { readRec } from "@/lib/files";

// 列出当前考试的所有表演录制历史(录像 + AI 评价),最新在前
export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ items: [] });
  const rows = db.prepare(
    "SELECT id, question_id, kp_id, score, feedback, created_at, q_stem, music_material_id FROM attempts WHERE exam_id=? AND user_answer='[表演录制]' ORDER BY id DESC LIMIT 200"
  ).all(exam.id);
  const items = rows.map((r) => {
    let stem = r.q_stem || "";
    if (!stem) { try { const q = db.prepare("SELECT body FROM questions WHERE id=?").get(r.question_id); if (q) stem = JSON.parse(q.body).stem || ""; } catch {} }
    const exists = !!db.prepare("SELECT 1 FROM questions WHERE id=? AND exam_id=?").get(r.question_id, exam.id);
    let hasRec = false; try { hasRec = !!readRec(r.id); } catch {}
    return { attemptId: r.id, questionId: r.question_id, kpId: r.kp_id, score: r.score, feedback: r.feedback, created_at: r.created_at, stem, questionExists: exists, hasRecording: hasRec, musicMaterialId: r.music_material_id || null };
  });
  return Response.json({ items });
}
