import { requireUser, unauthorized } from "@/lib/auth";
import { aiErrorResponse } from "@/lib/errors";
import { getLangBackground, setLangBackground, analyzeTransfers, predictTransfer, transferSummary } from "@/lib/langTransfer";

export const maxDuration = 120;

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const background = getLangBackground(user.id);
  if (!exam) return Response.json({ background, isLanguage: false, reason: "no_exam" });
  return Response.json({ background, isLanguage: exam.exam_type === "language", examName: exam.name, ...transferSummary(exam) });
}

export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    const body = await req.json();
    if (body.action === "background") return Response.json({ background: setLangBackground(user.id, body.background || {}) });
    if (!exam) return Response.json({ error: "no_exam" }, { status: 400 });
    if (body.action === "analyze") return Response.json(await analyzeTransfers(user, exam, {}));
    if (body.action === "predict") return Response.json(await predictTransfer(user, exam, String(body.topic || "").slice(0, 120)));
    return Response.json({ error: "unknown_action" }, { status: 400 });
  } catch (e) { return aiErrorResponse(e); }
}
