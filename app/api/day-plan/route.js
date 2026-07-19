import { requireUser, unauthorized } from "@/lib/auth";
import { dayPlanView, markDayItem, editDayPlan, clearDayPlan } from "@/lib/dayPlan";
import { allDatedTasks } from "@/lib/practical";
import { setReqUser } from "@/lib/reqctx";

// 跨考试按天排期:GET 看排期(含顺延),POST 勾完成/编辑/清空。
export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  setReqUser(user.id); // 让 devtime 拿到本用户的日期穿越偏移,否则周计划的“今天”会退回真实日期(P2-9)
  return Response.json({ view: dayPlanView(user.id), tasks: allDatedTasks(user.id), examDate: (exam && exam.exam_date) || "" });
}

export async function POST(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  setReqUser(user.id);
  const body = await req.json().catch(() => ({}));
  const { action } = body;
  if (action === "mark") { markDayItem(user.id, body.seq, body.done !== false); return Response.json({ ok: true, view: dayPlanView(user.id) }); }
  if (action === "edit") { editDayPlan(user.id, body.items || []); return Response.json({ ok: true, view: dayPlanView(user.id) }); }
  if (action === "clear") { clearDayPlan(user.id); return Response.json({ ok: true, view: null }); }
  return Response.json({ ok: false, note: "unknown_action" });
}
