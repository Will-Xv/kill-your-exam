import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { aiErrorResponse } from "@/lib/errors";
import { runLoop, execTool, isWrite, resumePlanApprove, resumePlanRevise } from "@/lib/chatAgent";
import { setReqUser } from "@/lib/reqctx";

export const maxDuration = 300;

// 用户对「计划」或「待确认改动」作出回应后,在后台继续这次运行。
export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (user) setReqUser(user.id);
    if (!user) return unauthorized();
    const { token, approvals, action, feedback } = await req.json();
    const run = db.prepare("SELECT * FROM chat_runs WHERE token=?").get(token);
    if (!run || run.user_id !== user.id) return forbidden();
    if (run.status !== "pending") return Response.json({ runId: run.id });

    // 计划确认门
    if (run.pending_kind === "plan") {
      if (action === "revise") resumePlanRevise(run, exam, user, feedback || "");
      else resumePlanApprove(run, exam, user);
      return Response.json({ runId: run.id });
    }

    // 写操作逐项批准/拒绝。先读出待执行内容,再【原子占坑】。
    const contents = JSON.parse(run.pending_contents_json || "[]");
    const calls = JSON.parse(run.pending_calls_json || "[]");
    // 【原子占坑·防重复执行】把 status 从 pending 抢成 running(只有当它还是 pending 时才成功)。
    // 若同一个确认被点了两下 / 横幅和页面各发一个 / 手机通知又触发一次——第二个请求拿到 changes=0,直接返回,绝不再执行一遍(不会重复布置任务)。
    const claim = db.prepare("UPDATE chat_runs SET status='running', token=NULL, actions_json=NULL, pending_kind=NULL, pending_contents_json=NULL, pending_calls_json=NULL, steps_json='[]', updated_at=datetime('now') WHERE id=? AND status='pending'").run(run.id);
    if (!claim.changes) return Response.json({ runId: run.id });   // 已被另一个并发请求认领
    try {
      const toolNotes = [];
      const parts = [];
      for (let idx = 0; idx < calls.length; idx++) {
        const c = calls[idx];
        let result;
        if (isWrite(c.name)) {
          if (approvals && approvals[idx]) { result = await execTool(c.name, c.args || {}, exam, user); if (result?.note) toolNotes.push(result.note); }
          else { result = { declined: true, note: "考生拒绝了这个操作" }; }
        } else { result = await execTool(c.name, c.args || {}, exam, user); if (result?.note) toolNotes.push(result.note); }
        parts.push({ functionResponse: { name: c.name, response: { result } } });
      }
      contents.push({ role: "user", parts });
      Promise.resolve().then(() => runLoop(run.id, contents, exam, user, toolNotes, "")).catch(() => { try { db.prepare("UPDATE chat_runs SET status='error' WHERE id=?").run(run.id); } catch {} });
      return Response.json({ runId: run.id });
    } catch (e) {
      // execTool 出错也别把 run 永久卡在(其实已占成 running,不会再弹确认);标成 error,横幅/确认不再纠缠。
      try { db.prepare("UPDATE chat_runs SET status='error' WHERE id=?").run(run.id); } catch {}
      return aiErrorResponse(e);
    }
  } catch (e) { return aiErrorResponse(e); }
}
