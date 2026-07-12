import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { listMemory, forgetFact, restoreFact } from "@/lib/memory";

// 仅开发者:读取杀手记得你什么(全局记忆)+ 软删/恢复。删除可恢复,便于排查。
export async function GET() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  if (!u.is_developer) return forbidden();
  const active = listMemory(u.id, {});
  const forgotten = listMemory(u.id, { includeInactive: true }).filter((r) => !r.active);
  return Response.json({ active, forgotten });
}
export async function POST(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  if (!u.is_developer) return forbidden();
  const b = await req.json().catch(() => ({}));
  if (b.action === "forget") return Response.json({ ok: forgetFact(u.id, b.id) });
  if (b.action === "restore") return Response.json({ ok: restoreFact(u.id, b.id) });
  return Response.json({ ok: false });
}
