import db, { rootExamId, familyScope, scopeSql } from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { setReqUser } from "@/lib/reqctx";

// 轮询某次杀手运行的状态/步骤/结果;不传 id 则返回本考试最近一个未完成(running/pending)的运行。
export async function GET(req) {
  const { user, exam } = await requireUser();
    if (user) setReqUser(user.id);
  if (!user) return unauthorized();
  const id = new URL(req.url).searchParams.get("id");
  let run;
  if (id) run = db.prepare(`SELECT * FROM chat_runs WHERE id=? AND exam_id IN ${scopeSql([...(exam ? familyScope(exam.id) : []), -user.id])}`).get(Number(id));
  else run = db.prepare(`SELECT * FROM chat_runs WHERE exam_id IN ${scopeSql([...(exam ? familyScope(exam.id) : []), -user.id])} AND status IN ('running','pending') ORDER BY id DESC LIMIT 1`).get();
  if (!run) return Response.json({ run: null });
  if (run.user_id !== user.id) return forbidden();
  // 看门狗(仅清理孤儿运行,不限制任务时长):后台运行每 15s 有心跳刷新 updated_at,所以【再长的任务只要进程还活着就一直算在跑】。
  // 只有当心跳也停了(进程崩溃/部署重启导致运行被丢弃)、updated_at 超过 120s 没动,才判定掉线、标记出错让前端停转。
  if (run.status === "running") {
    try {
      const staleSec = db.prepare("SELECT (julianday('now') - julianday(updated_at)) * 86400 AS s FROM chat_runs WHERE id=?").get(run.id)?.s;
      if (staleSec != null && staleSec > 120) {
        db.prepare("UPDATE chat_runs SET status='error', reply=?, updated_at=datetime('now') WHERE id=? AND status='running'").run("(连接中断了,请重试)", run.id);
        run.status = "error"; run.reply = "(连接中断了,请重试)";
      }
    } catch {}
  }
  let steps = []; try { steps = JSON.parse(run.steps_json || "[]"); } catch {}
  let actions = null; try { actions = run.actions_json ? JSON.parse(run.actions_json) : null; } catch {}
  let plan = null; try { plan = run.plan_json ? JSON.parse(run.plan_json) : null; } catch {}
  let elapsedSec = null; try { const e = db.prepare("SELECT (julianday('now') - julianday(created_at)) * 86400 AS e FROM chat_runs WHERE id=?").get(run.id)?.e; if (e != null) elapsedSec = Math.max(0, Math.round(e)); } catch {}
  return Response.json({ run: { id: run.id, status: run.status, steps, reply: run.reply || null, token: run.token || null, actions, pendingKind: run.pending_kind || null, plan, elapsedSec } });
}
