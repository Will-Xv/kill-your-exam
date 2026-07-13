import db, { inScope } from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { updateReviewQueue, invalidateKnowledgeState } from "@/lib/mastery";
import { addFact } from "@/lib/memory";

// 给某次作答打标:careless(粗心,其实会)| guessed(猜对的)| slow(懂但慢)。据此校准掌握度并安排验证/追踪。
export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const { attemptId, tag: tagIn } = await req.json().catch(() => ({}));
  const at = db.prepare("SELECT * FROM attempts WHERE id=?").get(Number(attemptId));
  if (!at) return Response.json({ error: "not found" }, { status: 404 });
  if (!exam || !inScope(exam.id, at.exam_id)) return forbidden();
  const tag = ["careless", "guessed", "slow", ""].includes(tagIn) ? (tagIn || null) : null;
  db.prepare("UPDATE attempts SET tag=? WHERE id=?").run(tag, at.id);
  const kt = at.kp_id ? (db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(at.kp_id)?.title || "") : "";
  let note = "";
  try {
    if (tag === "careless") { note = "已记为粗心:不太计入掌握度,归入粗心失误追踪"; addFact(user.id, at.exam_id, { subject: kt || "粗心追踪", kind: "observation", claim: `「${kt}」这题是粗心错的、不是不会;归入 careless 追踪`, valence: "neutral", scope: "exam" }); }
    else if (tag === "guessed") { note = "已记为猜对:不给满掌握度,已安排一道验证题尽快再考"; updateReviewQueue(at.question_id, false); addFact(user.id, at.exam_id, { subject: kt || "验证", kind: "observation", claim: `「${kt}」这题是猜对的,证据打折、需验证`, valence: "weak", scope: "exam" }); }
    else if (tag === "slow") { note = "已记为懂但慢:掌握度照常,另标记需练速度"; addFact(user.id, at.exam_id, { subject: kt || "速度", kind: "observation", claim: `「${kt}」理解但速度不足,需专门练速度`, valence: "neutral", scope: "exam" }); }
    else { note = "已清除标记"; }
    invalidateKnowledgeState(at.exam_id);
  } catch {}
  return Response.json({ ok: true, tag, note });
}
