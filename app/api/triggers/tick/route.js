import { getSessionUser, unauthorized } from "@/lib/auth";
import { getActiveExam } from "@/lib/db";
import { onSession } from "@/lib/triggers";

// 打开应用时轻量打点:触发 session/每日/每周级触发器。仅开发者账号(灰度)。
export async function POST() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  if (!u.is_developer) return Response.json({ ok: true, skipped: true });
  const ex = getActiveExam(u.id);
  if (!ex) return Response.json({ ok: true, noExam: true });
  let fired = null;
  try { fired = onSession(u.id, ex.id); } catch {}
  return Response.json({ ok: true, fired });
}
