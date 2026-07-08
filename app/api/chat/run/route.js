import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";

// 轮询某次杀手运行的状态/步骤/结果;不传 id 则返回本考试最近一个未完成(running/pending)的运行。
export async function GET(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ run: null });
  const id = new URL(req.url).searchParams.get("id");
  let run;
  if (id) run = db.prepare("SELECT * FROM chat_runs WHERE id=? AND exam_id=?").get(Number(id), exam.id);
  else run = db.prepare("SELECT * FROM chat_runs WHERE exam_id=? AND status IN ('running','pending') ORDER BY id DESC LIMIT 1").get(exam.id);
  if (!run) return Response.json({ run: null });
  if (run.user_id !== user.id) return forbidden();
  let steps = []; try { steps = JSON.parse(run.steps_json || "[]"); } catch {}
  let actions = null; try { actions = run.actions_json ? JSON.parse(run.actions_json) : null; } catch {}
  let plan = null; try { plan = run.plan_json ? JSON.parse(run.plan_json) : null; } catch {}
  return Response.json({ run: { id: run.id, status: run.status, steps, reply: run.reply || null, token: run.token || null, actions, pendingKind: run.pending_kind || null, plan } });
}
