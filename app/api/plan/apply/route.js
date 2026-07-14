import db, { rootExamId } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { crossExamPlan } from "@/lib/planner";
import { aiErrorResponse } from "@/lib/errors";

// 把跨考试规划(含时间分配/审视优化)的【当前激活考试】那份任务,落成今日任务(写入 daily_plans)。
// 这样"按时间安排"和"自我审视"就真正驱动首页今日任务,而不是只在 /plan 页看看。
export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    if (!exam) return Response.json({ error: "no_exam" }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const minutes = Number(body && body.minutes) || undefined;
    const mode = body && body.mode === "sprint" ? "sprint" : undefined;
    const cp = crossExamPlan(user.id, { totalMinutes: minutes, mode });
    const rootId = rootExamId(exam.id);
    const e = (cp.exams || []).find((x) => Number(x.id) === Number(rootId)) || (cp.exams || []).find((x) => Number(x.id) === Number(exam.id));
    if (!e) return Response.json({ error: "no_plan_for_exam" }, { status: 400 });
    const items = (e.tasks || []).map((tk) => {
      if (tk.type === "review") return { type: "review" };
      if (tk.type === "kp") return { type: "kp", kpId: tk.kpId, title: tk.title };
      if (tk.type === "free") return { type: "free", target: 10 };
      return null;
    }).filter(Boolean);
    if (!items.some((it) => it.type === "review")) items.unshift({ type: "review" });
    const today = new Date().toLocaleDateString("sv-SE");
    db.prepare("DELETE FROM daily_plans WHERE exam_id=? AND date=?").run(exam.id, today);
    db.prepare("INSERT INTO daily_plans(exam_id,date,items_json,completed) VALUES(?,?,?,0)").run(exam.id, today, JSON.stringify(items));
    return Response.json({ ok: true, applied: items.length, minutes: cp.totalMinutes });
  } catch (e) { return aiErrorResponse(e); }
}
