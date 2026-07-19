import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { inScope } from "@/lib/db";
import { aiErrorResponse } from "@/lib/errors";
import { getTask, appealTest } from "@/lib/practical";

export const maxDuration = 90;

export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    const { taskId, idx, testIndex, note } = await req.json();
    const task = getTask(Number(taskId));
    if (!task || task.user_id !== user.id) return forbidden();
    if (!exam || !inScope(exam.id, task.exam_id)) setActiveExam(user.id, task.exam_id);
    const r = await appealTest(user, task, Number(idx), Number(testIndex), String(note || "").slice(0, 400));
    return Response.json(r);
  } catch (e) { return aiErrorResponse(e); }
}
