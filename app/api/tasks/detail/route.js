import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { inScope } from "@/lib/db";
import { getTask } from "@/lib/practical";
import { judge0Config } from "@/lib/judge0";

export async function GET(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const id = Number(new URL(req.url).searchParams.get("id"));
  const task = getTask(id);
  if (!task || !exam || !inScope(exam.id, task.exam_id)) return forbidden();
  return Response.json({ task, judge0: judge0Config().configured });
}
