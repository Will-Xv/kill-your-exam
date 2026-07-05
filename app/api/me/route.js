import db from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { GUIDE_VERSION } from "@/lib/guide";
export async function GET() {
  const u = await getSessionUser();
  if (!u) return Response.json({ user: null }, { status: 401 });
  const hasExam = !!db.prepare("SELECT 1 FROM exams WHERE user_id=? AND deleted_at IS NULL LIMIT 1").get(u.id);
  return Response.json({ user: { id: u.id, username: u.username, isAdmin: !!u.is_admin, isDeveloper: !!u.is_developer, lang: u.lang || "en",
    onboarded: !!u.onboarded, guideVersion: u.guide_version || 0, guideCurrent: GUIDE_VERSION, hasExam } });
}
export async function PATCH(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { lang } = await req.json();
  if (["zh", "zh-TW", "zh-HK", "en", "fr", "es", "ru", "ar", "id"].includes(lang)) db.prepare("UPDATE users SET lang=? WHERE id=?").run(lang, u.id);
  return Response.json({ ok: true });
}
