import { inScope, setActiveExam } from "@/lib/db";
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
  if (!task || task.user_id !== user.id) return Response.json({ messages: [] });
  return Response.json({ messages: taskChatHistory(taskId) });
}

export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    const { taskId, message, live, attachments } = await req.json();
    const task = getTask(Number(taskId));
    if (!task || task.user_id !== user.id) return forbidden();
    if (!exam || !inScope(exam.id, task.exam_id)) setActiveExam(user.id, task.exam_id);
    if (!String(message || "").trim() && !(Array.isArray(attachments) && attachments.length)) return Response.json({ reply: "" });
    const r = await taskChatTurn(user, task, message, Array.isArray(live) ? live : [], Array.isArray(attachments) ? attachments : []);
    return Response.json(r);
  } catch (e) { return aiErrorResponse(e); }
}
