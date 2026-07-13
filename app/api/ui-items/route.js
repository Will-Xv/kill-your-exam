import db, { getActiveExam } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { getExamPlacement } from "@/lib/uiPlacement";
import { getCustomItems } from "@/lib/uiRegistry";

// 全站默认栏目放置:GET 公开读取,POST 仅开发者发布/清除。
export async function GET() {
  let placement = null, examPlacement = null, customItems = [];
  try { customItems = getCustomItems(); } catch {}
  try { const row = db.prepare("SELECT value FROM settings WHERE key='ui_item_placement'").get(); if (row && row.value) placement = JSON.parse(row.value); } catch {}
  try { const u = await getSessionUser(); if (u) { const ex = getActiveExam(u.id); if (ex) examPlacement = getExamPlacement(ex.id); } } catch {}
  return Response.json({ placement, examPlacement, customItems });
}
export async function POST(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  if (!u.is_developer) return forbidden();
  const body = await req.json().catch(() => ({}));
  const placement = body && body.placement;
  if (placement == null) { db.prepare("DELETE FROM settings WHERE key='ui_item_placement'").run(); return Response.json({ ok: true, cleared: true }); }
  db.prepare("INSERT INTO settings(key,value) VALUES('ui_item_placement',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(placement));
  return Response.json({ ok: true });
}
