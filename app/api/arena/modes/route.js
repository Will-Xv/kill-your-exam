import { requireUser, unauthorized } from "@/lib/auth";
import { aiErrorResponse } from "@/lib/errors";
import { createMode, listModes, deleteMode, recordResult, getMode, generateModes } from "@/lib/customModes";
import { inScope } from "@/lib/db";

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
    if (b.generate) { return Response.json(await generateModes(user, exam, { count: Math.min(5, Math.max(1, Number(b.count) || 3)) })); }
    if (b.result && b.modeId) {
      const m = getMode(b.modeId);
      if (!m || !inScope(exam.id, m.exam_id)) return Response.json({ ok: false });
      return Response.json(recordResult(user, m, { meter: Number(b.meter), win: !!b.win }));
    }
    const r = createMode(user, exam, {
      kind: b.kind, name: b.name, emoji: b.emoji, spec: b.spec,
      meterLabel: b.meterLabel, winDesc: b.winDesc, meterStart: b.meterStart, meterDir: b.meterDir, format: b.format, where: b.where,
    });
    return Response.json({ ok: true, ...r });
  } catch (e) { return aiErrorResponse(e); }
}
