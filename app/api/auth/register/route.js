import db from "@/lib/db";
import { hashPassword, createSession, setSessionCookie } from "@/lib/auth";

export async function POST(req) {
  const { username, password, invite } = await req.json();
  const expected = process.env.ACCESS_CODE || "666666";
  if (String(invite).trim() !== expected) return Response.json({ error: "邀请码不对" }, { status: 400 });
  const name = String(username || "").trim();
  if (name.length < 2 || name.length > 20) return Response.json({ error: "用户名需 2~20 个字符" }, { status: 400 });
  if (String(password || "").length < 6) return Response.json({ error: "密码至少 6 位" }, { status: 400 });
  if (db.prepare("SELECT id FROM users WHERE username=?").get(name)) return Response.json({ error: "用户名已被使用" }, { status: 400 });
  const isFirst = db.prepare("SELECT COUNT(*) n FROM users").get().n === 0;
  const { salt, hash } = hashPassword(password);
  const info = db.prepare("INSERT INTO users(username,password_hash,salt,is_admin) VALUES(?,?,?,?)").run(name, hash, salt, isFirst ? 1 : 0);
  await setSessionCookie(createSession(info.lastInsertRowid));
  return Response.json({ ok: true, isAdmin: isFirst });
}
