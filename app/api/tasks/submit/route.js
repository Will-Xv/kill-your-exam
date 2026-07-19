import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { inScope, setActiveExam } from "@/lib/db";
import { aiErrorResponse } from "@/lib/errors";
import { getTask, gradeMilestone } from "@/lib/practical";

export const maxDuration = 120;

export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    const { taskId, idx, submission, language, attachments } = await req.json();
    const task = getTask(Number(taskId));
    if (!task || task.user_id !== user.id) return forbidden();
    if (!exam || !inScope(exam.id, task.exam_id)) setActiveExam(user.id, task.exam_id);
    const r = await gradeMilestone(user, task, Number(idx), { submission: String(submission || ""), language, attachments });
    return Response.json(r);
  } catch (e) { return aiErrorResponse(e); }
}
