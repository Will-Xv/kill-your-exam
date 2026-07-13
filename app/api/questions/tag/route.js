import db, { inScope } from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { applyMasteryTag } from "@/lib/attemptTags";

// 给某次作答打掌握度标记:careless(粗心)| guessed(猜对)| slow(懂但慢)| ""(清除)。
export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const { attemptId, tag } = await req.json().catch(() => ({}));
  const at = db.prepare("SELECT * FROM attempts WHERE id=?").get(Number(attemptId));
  if (!at) return Response.json({ error: "not found" }, { status: 404 });
  if (!exam || !inScope(exam.id, at.exam_id)) return forbidden();
  const r = applyMasteryTag(user.id, at, tag);
  return Response.json({ ok: true, ...r });
}
