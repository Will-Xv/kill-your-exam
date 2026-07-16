import { requireUser, unauthorized } from "@/lib/auth";
import { listCheckpoints, restore, redoCheckpoint, clearCheckpoints } from "@/lib/checkpoint";

export async function GET() {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  return Response.json({ checkpoints: listCheckpoints(user.id, 50) });
}

export async function POST(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const { action, checkpointId } = await req.json().catch(() => ({}));
  if (action === "clear") { const n = clearCheckpoints(user.id); return Response.json({ ok: true, cleared: n }); }
  if (action === "rollback") {
    try { const r = restore(checkpointId, user.id); return Response.json({ ok: true, restored: r }); }
    catch (e) { return Response.json({ error: String((e && e.message) || e) }, { status: 400 }); }
  }
  if (action === "redo") {
    try { const r = redoCheckpoint(checkpointId, user.id); return Response.json({ ok: true, redone: r }); }
    catch (e) { return Response.json({ error: String((e && e.message) || e) }, { status: 400 }); }
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
