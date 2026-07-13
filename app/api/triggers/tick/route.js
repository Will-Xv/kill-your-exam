import { getSessionUser, unauthorized } from "@/lib/auth";
import { getActiveExam } from "@/lib/db";
import { onSession } from "@/lib/triggers";
import { ensureCron } from "@/lib/cron";

// 打开应用时轻量打点:触发 session/每日/每周级触发器。仅开发者账号(灰度)。
export async function POST() {
  ensureCron(); // 确保进程内定时器已启动
  const u = await getSessionUser();
  if (!u) return unauthorized();
  if (!u.is_developer) return Response.json({ ok: true, skipped: true });
  const ex = getActiveExam(u.id);
  if (!ex) return Response.json({ ok: true, noExam: true });
  let fired = null;
  try { fired = await onSession(u.id, ex.id); } catch {}
  return Response.json({ ok: true, fired });
}
