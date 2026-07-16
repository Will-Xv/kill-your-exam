import db, { getSetting, setSetting } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { crossExamPlan, weekPlan } from "@/lib/planner";
import { todayStr } from "@/lib/devtime";

// 本地日期 YYYY-MM-DD,加 n 天。
function addDays(baseStr, n) {
  const d = new Date(baseStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("sv-SE");
}

export async function GET(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") || undefined;

  // 多天排期:?week=1(&caps=20,180,0,...)。caps 为从今天起每天的可用分钟;省略则用上次保存的,再没有就每天 60。
  if (url.searchParams.get("week")) {
    const today = todayStr();
    let caps = url.searchParams.get("caps");
    if (caps != null) { try { setSetting("week_caps:" + user.id, caps); } catch {} }
    else { try { caps = getSetting("week_caps:" + user.id); } catch {} }
    let mins = (caps || "").split(",").map((x) => Math.max(0, parseInt(x, 10) || 0));
    if (!mins.length || mins.every((m) => m === 0 && caps == null)) mins = Array(7).fill(60);
    if (mins.length < 1) mins = Array(7).fill(60);
    const dayCaps = mins.slice(0, 21).map((m, i) => ({ date: addDays(today, i), minutes: m }));
    try { return Response.json(weekPlan(user.id, { dayCaps, mode })); }
    catch { return Response.json({ days: [], examCount: 0 }); }
  }

  const totalMinutes = Number(url.searchParams.get("minutes")) || undefined;
  try { return Response.json(crossExamPlan(user.id, { totalMinutes, mode })); }
  catch { return Response.json({ exams: [], totalMinutes: totalMinutes || 90, topTask: null, examCount: 0 }); }
}
