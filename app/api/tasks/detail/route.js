import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { inScope, setActiveExam } from "@/lib/db";
import { getTask } from "@/lib/practical";
import { judge0Config } from "@/lib/judge0";

export async function GET(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const id = Number(new URL(req.url).searchParams.get("id"));
  const task = getTask(id);
  if (!task) return forbidden();
  const off = !exam || !inScope(exam.id, task.exam_id); // 任务不在当前激活考试家族里
  if (off && !setActiveExam(user.id, task.exam_id)) return forbidden(); // 就自动把激活考试切到任务所属考试;切得过去=是你的、放行,切不过去=不是你的、拒。全程走考试依赖
  return Response.json({ task, judge0: judge0Config().configured, switchedExamId: off ? task.exam_id : null });
}
