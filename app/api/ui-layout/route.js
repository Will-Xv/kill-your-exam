import db, { getActiveExam } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { getExamLayout } from "@/lib/uiHomeLayout";

// 全站默认首页布局:GET 公开(所有用户读取并套用),POST 仅开发者(发布/取消发布)。
export async function GET() {
  let layout = null, examLayout = null;
  try { const row = db.prepare("SELECT value FROM settings WHERE key='ui_default_layout'").get(); if (row && row.value) layout = JSON.parse(row.value); } catch {}
  try { const u = await getSessionUser(); if (u && u.is_developer) { const ex = getActiveExam(u.id); if (ex) examLayout = getExamLayout(ex.id); } } catch {} // 仅开发者账号有 per-exam 布局
  return Response.json({ layout, examLayout });
}

export async function POST(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  if (!u.is_developer) return forbidden();
  const body = await req.json().catch(() => ({}));
  const layout = body && body.layout;
  if (layout == null) { db.prepare("DELETE FROM settings WHERE key='ui_default_layout'").run(); return Response.json({ ok: true, cleared: true }); }
  db.prepare("INSERT INTO settings(key,value) VALUES('ui_default_layout',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(layout));
  return Response.json({ ok: true });
}
