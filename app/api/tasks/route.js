import { requireUser, unauthorized } from "@/lib/auth";
import { aiErrorResponse } from "@/lib/errors";
import { assignTask, listTasks } from "@/lib/practical";
import { judge0Config } from "@/lib/judge0";

export const maxDuration = 120;

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ tasks: [], judge0: judge0Config().configured });
  return Response.json({ tasks: listTasks(exam), judge0: judge0Config().configured });
}

export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    if (!exam) return Response.json({ error: "no_exam" }, { status: 400 });
    const { topic, kpId } = await req.json();
    const r = await assignTask(user, exam, { topic: String(topic || "").slice(0, 160), kpId });
    return Response.json(r);
  } catch (e) { return aiErrorResponse(e); }
}
