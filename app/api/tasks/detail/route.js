import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { inScope, setActiveExam } from "@/lib/db";
import { getTask } from "@/lib/practical";
import { judge0Config } from "@/lib/judge0";

export async function GET(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const id = Number(new URL(req.url).searchParams.get("id"));
  const task = getTask(id);
  if (!task || task.user_id !== user.id) return forbidden(); // 归属看 user
  if (!exam || !inScope(exam.id, task.exam_id)) setActiveExam(user.id, task.exam_id); // 打开别的考试的任务 → 自动把激活考试切过去,整个 UI 跟着对齐(不再 403 → 永久 loading)
  return Response.json({ task, judge0: judge0Config().configured, switchedExamId: (!exam || !inScope(exam.id, task.exam_id)) ? task.exam_id : null });
}
