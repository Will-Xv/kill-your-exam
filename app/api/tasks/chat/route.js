import { inScope } from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { getTask, taskChatHistory, taskChatTurn } from "@/lib/practical";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 120;

// 实践作业里的做题聊天:GET 取历史,POST 发一句(AI 引导 + 观察进掌握度 + 存记录)。
export async function GET(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const taskId = Number(new URL(req.url).searchParams.get("taskId"));
  const task = getTask(taskId);
  if (!task || !exam || !inScope(exam.id, task.exam_id)) return Response.json({ messages: [] });
  return Response.json({ messages: taskChatHistory(taskId) });
}

export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    const { taskId, message } = await req.json();
    const task = getTask(Number(taskId));
    if (!task || !exam || !inScope(exam.id, task.exam_id)) return forbidden();
    if (!String(message || "").trim()) return Response.json({ reply: "" });
    const r = await taskChatTurn(user, task, message);
    return Response.json(r);
  } catch (e) { return aiErrorResponse(e); }
}
