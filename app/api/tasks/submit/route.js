import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { inScope } from "@/lib/db";
import { aiErrorResponse } from "@/lib/errors";
import { getTask, gradeMilestone } from "@/lib/practical";

export const maxDuration = 120;

export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    const { taskId, idx, submission, language } = await req.json();
    const task = getTask(Number(taskId));
    if (!task || !exam || !inScope(exam.id, task.exam_id)) return forbidden();
    const r = await gradeMilestone(user, task, Number(idx), { submission: String(submission || ""), language });
    return Response.json(r);
  } catch (e) { return aiErrorResponse(e); }
}
