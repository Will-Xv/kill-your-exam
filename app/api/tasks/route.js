import { requireUser, unauthorized } from "@/lib/auth";
import { aiErrorResponse } from "@/lib/errors";
import { assignTask, listTasks, deleteTask, getPracticalMode, setPracticalMode } from "@/lib/practical";
import { inScope } from "@/lib/db";
import { getTask } from "@/lib/practical";
import { judge0Config } from "@/lib/judge0";

export const maxDuration = 120;

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ tasks: [], judge0: judge0Config().configured });
  return Response.json({ tasks: listTasks(exam), judge0: judge0Config().configured, practicalMode: getPracticalMode(exam.id) });
}

export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    if (!exam) return Response.json({ error: "no_exam" }, { status: 400 });
    const b = await req.json();
    if (b.setMode !== undefined) return Response.json({ ok: true, practicalMode: setPracticalMode(exam.id, !!b.setMode) });
    if (b.delete) {
      const tk = getTask(Number(b.delete));
      if (!tk || !inScope(exam.id, tk.exam_id)) return Response.json({ ok: false });
      return Response.json({ ok: deleteTask(user, b.delete) });
    }
    const r = await assignTask(user, exam, { topic: String(b.topic || "").slice(0, 160), kpId: b.kpId });
    return Response.json(r);
  } catch (e) { return aiErrorResponse(e); }
}
