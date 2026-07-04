import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { aiErrorResponse } from "@/lib/errors";
import { runAgent, execTool, WRITE_TOOLS } from "@/lib/chatAgent";

export const maxDuration = 300;

export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    const { token, approvals } = await req.json();
    const pend = db.prepare("SELECT * FROM chat_pending WHERE token=?").get(token);
    if (!pend || pend.user_id !== user.id) return forbidden();
    const contents = JSON.parse(pend.contents_json);
    const calls = JSON.parse(pend.calls_json);
    db.prepare("DELETE FROM chat_pending WHERE token=?").run(token);

    const toolNotes = [];
    const parts = [];
    for (let idx = 0; idx < calls.length; idx++) {
      const c = calls[idx];
      let result;
      if (WRITE_TOOLS.has(c.name)) {
        if (approvals && approvals[idx]) { result = await execTool(c.name, c.args || {}, exam, user); if (result?.note) toolNotes.push(result.note); }
        else { result = { declined: true, note: "考生拒绝了这个操作" }; toolNotes.push("已拒绝一个改动"); }
      } else { result = await execTool(c.name, c.args || {}, exam, user); if (result?.note) toolNotes.push(result.note); }
      parts.push({ functionResponse: { name: c.name, response: { result } } });
    }
    contents.push({ role: "user", parts });
    const out = await runAgent(contents, exam, user, toolNotes);
    return Response.json(out);
  } catch (e) { return aiErrorResponse(e); }
}
