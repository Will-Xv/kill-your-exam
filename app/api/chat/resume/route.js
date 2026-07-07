import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { aiErrorResponse } from "@/lib/errors";
import { agentLoop, execTool, WRITE_TOOLS } from "@/lib/chatAgent";

export const maxDuration = 300;

// 用户对某个待确认的改动作出批准/拒绝后,在后台继续这次运行。
export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    const { token, approvals } = await req.json();
    const run = db.prepare("SELECT * FROM chat_runs WHERE token=?").get(token);
    if (!run || run.user_id !== user.id) return forbidden();
    if (run.status !== "pending") return Response.json({ runId: run.id });
    const contents = JSON.parse(run.pending_contents_json || "[]");
    const calls = JSON.parse(run.pending_calls_json || "[]");
    const toolNotes = [];
    const parts = [];
    for (let idx = 0; idx < calls.length; idx++) {
      const c = calls[idx];
      let result;
      if (WRITE_TOOLS.has(c.name)) {
        if (approvals && approvals[idx]) { result = await execTool(c.name, c.args || {}, exam, user); if (result?.note) toolNotes.push(result.note); }
        else { result = { declined: true, note: "考生拒绝了这个操作" }; }
      } else { result = await execTool(c.name, c.args || {}, exam, user); if (result?.note) toolNotes.push(result.note); }
      parts.push({ functionResponse: { name: c.name, response: { result } } });
    }
    contents.push({ role: "user", parts });
    db.prepare("UPDATE chat_runs SET status='running', token=NULL, actions_json=NULL, pending_contents_json=NULL, pending_calls_json=NULL, updated_at=datetime('now') WHERE id=?").run(run.id);
    Promise.resolve().then(() => agentLoop(run.id, contents, exam, user, toolNotes)).catch(() => { try { db.prepare("UPDATE chat_runs SET status='error' WHERE id=?").run(run.id); } catch {} });
    return Response.json({ runId: run.id });
  } catch (e) { return aiErrorResponse(e); }
}
