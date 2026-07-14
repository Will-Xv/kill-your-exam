import { requireUser, unauthorized } from "@/lib/auth";
import { aiErrorResponse } from "@/lib/errors";
import { createMode, listModes, deleteMode } from "@/lib/customModes";

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ play: [], exam_form: [] });
  return Response.json({ play: listModes(exam, "play"), exam_form: listModes(exam, "exam_form") });
}

export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    if (!exam) return Response.json({ error: "no_exam" }, { status: 400 });
    const b = await req.json();
    if (b.delete) { return Response.json({ ok: deleteMode(user, b.delete) }); }
    const r = createMode(user, exam, {
      kind: b.kind, name: b.name, emoji: b.emoji, spec: b.spec,
      meterLabel: b.meterLabel, winDesc: b.winDesc, meterStart: b.meterStart, meterDir: b.meterDir,
    });
    return Response.json({ ok: true, ...r });
  } catch (e) { return aiErrorResponse(e); }
}
