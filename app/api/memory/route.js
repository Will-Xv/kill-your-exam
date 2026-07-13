import { getSessionUser, unauthorized } from "@/lib/auth";
import { listMemory, forgetFact, restoreFact } from "@/lib/memory";

// 读取杀手对你的长期记忆(全局+按考试)+ 软删/恢复。所有用户可查看/管理【自己的】记忆(类20.2)。
export async function GET() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const active = listMemory(u.id, {});
  const forgotten = listMemory(u.id, { includeInactive: true }).filter((r) => !r.active);
  return Response.json({ active, forgotten });
}
export async function POST(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const b = await req.json().catch(() => ({}));
  if (b.action === "forget") return Response.json({ ok: forgetFact(u.id, b.id) });
  if (b.action === "restore") return Response.json({ ok: restoreFact(u.id, b.id) });
  return Response.json({ ok: false });
}
