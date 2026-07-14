import { getSessionUser, unauthorized } from "@/lib/auth";
import { getActiveExam, getSetting, setSetting } from "@/lib/db";
import { onSession } from "@/lib/triggers";
import { ensureCron } from "@/lib/cron";

// 打开应用时轻量打点:触发 session/每日/每周级触发器。所有用户。
export async function POST(req) {
  ensureCron(); // 确保进程内定时器已启动
  const u = await getSessionUser();
  if (!u) return unauthorized();
  try { const body = await req.json().catch(() => ({})); const tz = body && body.tz; if (tz && /^[A-Za-z]+\/[A-Za-z_\/+-]+$/.test(String(tz))) setSetting("tz:" + u.id, String(tz).slice(0, 60)); } catch {}
  const ex = getActiveExam(u.id);
  if (!ex) return Response.json({ ok: true, noExam: true });
  let fired = null;
  try { fired = await onSession(u.id, ex.id); } catch {}
  let tzInfo = null;
  try { const t = getSetting("tz:" + u.id, "") || "UTC"; tzInfo = { tz: t, localDay: new Intl.DateTimeFormat("en-CA", { timeZone: t }).format(new Date()), localDow: new Intl.DateTimeFormat("en-US", { timeZone: t, weekday: "short" }).format(new Date()) }; } catch {}
  return Response.json({ ok: true, fired, tzInfo });
}
