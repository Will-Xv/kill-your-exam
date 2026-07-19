import { requireUser, unauthorized } from "@/lib/auth";
import { listCheckpoints, restore, redoCheckpoint, clearCheckpoints } from "@/lib/checkpoint";
import { listUiCheckpoints, restoreUiEvent, redoUiEvent, clearUiEvents } from "@/lib/uiPlacement";

export async function GET() {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const struct = listCheckpoints(user.id, 50).map((c) => ({ ...c, kind: "struct" }));
  const ui = listUiCheckpoints(user.id).map((c) => ({ id: c.id, kind: "ui", op: "ui_layout", names: c.examName ? [c.examName] : [], summary: c.summary, created_at: c.created_at, undone: c.undone, redoable: c.redoable }));
  // 结构改动 + UI 布局改动合并成一份「后悔药」清单,按时间倒序(P2-17)
  const all = [...struct, ...ui].sort((a, b) => (String(a.created_at) < String(b.created_at) ? 1 : String(a.created_at) > String(b.created_at) ? -1 : 0));
  return Response.json({ checkpoints: all });
}

export async function POST(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const { action, checkpointId, kind } = await req.json().catch(() => ({}));
  if (action === "clear") { const n = clearCheckpoints(user.id); const m = clearUiEvents(user.id); return Response.json({ ok: true, cleared: n + m }); }
  if (action === "rollback") {
    try { const r = kind === "ui" ? restoreUiEvent(checkpointId, user.id) : restore(checkpointId, user.id); return Response.json({ ok: true, restored: r }); }
    catch (e) { return Response.json({ error: String((e && e.message) || e) }, { status: 400 }); }
  }
  if (action === "redo") {
    try { const r = kind === "ui" ? redoUiEvent(checkpointId, user.id) : redoCheckpoint(checkpointId, user.id); return Response.json({ ok: true, redone: r }); }
    catch (e) { return Response.json({ error: String((e && e.message) || e) }, { status: 400 }); }
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
