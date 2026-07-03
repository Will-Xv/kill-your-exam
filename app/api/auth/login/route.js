import db from "@/lib/db";
import { verifyPassword, createSession, setSessionCookie } from "@/lib/auth";

export async function POST(req) {
  const { username, password } = await req.json();
  const u = db.prepare("SELECT * FROM users WHERE username=?").get(String(username || "").trim());
  if (!u || !verifyPassword(String(password || ""), u.salt, u.password_hash)) {
    return Response.json({ error: "用户名或密码不对" }, { status: 401 });
  }
  await setSessionCookie(createSession(u.id));
  return Response.json({ ok: true });
}
