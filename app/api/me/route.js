import db from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/auth";
export async function GET() {
  const u = await getSessionUser();
  if (!u) return Response.json({ user: null }, { status: 401 });
  return Response.json({ user: { id: u.id, username: u.username, isAdmin: !!u.is_admin, isDeveloper: !!u.is_developer, lang: u.lang || "en" } });
}
export async function PATCH(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { lang } = await req.json();
  if (["zh", "en", "fr", "es", "ru", "ar", "id"].includes(lang)) db.prepare("UPDATE users SET lang=? WHERE id=?").run(lang, u.id);
  return Response.json({ ok: true });
}
