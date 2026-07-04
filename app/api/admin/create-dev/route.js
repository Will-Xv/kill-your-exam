import db from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

// 管理员创建开发者子账号(无需邀请码)
export async function POST(req) {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  if (!me.is_admin) return forbidden();
  const { username, password } = await req.json();
  const name = String(username || "").trim();
  if (name.length < 2 || name.length > 20) return Response.json({ error: "用户名需 2~20 个字符" }, { status: 400 });
  if (String(password || "").length < 6) return Response.json({ error: "密码至少 6 位" }, { status: 400 });
  if (db.prepare("SELECT id FROM users WHERE username=?").get(name)) return Response.json({ error: "用户名已被使用" }, { status: 400 });
  const { salt, hash } = hashPassword(password);
  db.prepare("INSERT INTO users(username,password_hash,salt,is_admin,is_developer,lang) VALUES(?,?,?,0,1,?)").run(name, hash, salt, me.lang || "en");
  return Response.json({ ok: true });
}
