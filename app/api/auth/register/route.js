import db from "@/lib/db";
import { hashPassword, createSession, setSessionCookie } from "@/lib/auth";
import { langForReq } from "@/lib/geo";

export async function POST(req) {
  const { username, password, invite } = await req.json();
  const expected = process.env.ACCESS_CODE || "666666";
  if (String(invite).trim() !== expected) return Response.json({ error: "邀请码不对" }, { status: 400 });
  const name = String(username || "").trim();
  if (name.length < 2 || name.length > 20) return Response.json({ error: "用户名需 2~20 个字符" }, { status: 400 });
  if (String(password || "").length < 6) return Response.json({ error: "密码至少 6 位" }, { status: 400 });
  if (db.prepare("SELECT id FROM users WHERE username=?").get(name)) return Response.json({ error: "用户名已被使用" }, { status: 400 });
  const isFirst = db.prepare("SELECT COUNT(*) n FROM users").get().n === 0;
  const defLang = await langForReq(req).catch(() => "en"); // 新用户:按 IP 国家设默认语言,不在支持列表则英语
  const { salt, hash } = hashPassword(password);
  const info = db.prepare("INSERT INTO users(username,password_hash,salt,is_admin,is_developer,lang) VALUES(?,?,?,?,0,?)").run(name, hash, salt, isFirst ? 1 : 0, defLang);
  await setSessionCookie(createSession(info.lastInsertRowid));
  return Response.json({ ok: true, isAdmin: isFirst });
}
