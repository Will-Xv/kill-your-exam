import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/db";
import { dayOffset, todayStr } from "@/lib/devtime";
import { setReqUser } from "@/lib/reqctx";

function realToday() { return new Date().toLocaleDateString("sv-SE"); }

export async function GET() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  if (!u.is_developer) return forbidden();
  setReqUser(u.id);
  return Response.json({ ok: true, offset: dayOffset(), today: todayStr(), realToday: realToday() });  // dayOffset 已按当前账号
}

// op: "advance"(相对拨 days 天,可负) | "set"(设成绝对 YYYY-MM-DD) | "reset"(回到真实今天)
export async function POST(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  if (!u.is_developer) return forbidden();
  setReqUser(u.id);
  const b = await req.json().catch(() => ({}));
  const KEY = `dev_day_offset:${u.id}`;
  let off = dayOffset();
  if (b.op === "reset") off = 0;
  else if (b.op === "advance") off = off + (parseInt(b.days, 10) || 0);
  else if (b.op === "set" && b.date) {
    const target = new Date(String(b.date).slice(0, 10) + "T00:00:00");
    const base = new Date(realToday() + "T00:00:00");
    if (!isNaN(target.getTime())) off = Math.round((target.getTime() - base.getTime()) / 86400000);
  }
  // 安全护栏:限制在 ±370 天
  off = Math.max(-370, Math.min(370, off));
  setSetting(KEY, String(off));   // 【按用户】仅改当前账号的日期偏移
  return Response.json({ ok: true, offset: off, today: todayStr(), realToday: realToday() });
}
