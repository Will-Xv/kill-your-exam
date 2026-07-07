import db from "@/lib/db";
import { getSessionUser, createSession, setSessionCookie, unauthorized, forbidden } from "@/lib/auth";

// 特权账号(管理员/开发者)之间的快速切换。只在自己的特权账号间切换会话,
// 不涉及密码、不创建账号、不改任何账号的权限。
export async function GET() {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  if (!me.is_admin && !me.is_developer) return forbidden();
  const rows = db.prepare(
    "SELECT id, username, is_admin, is_developer FROM users WHERE deleted_at IS NULL AND (COALESCE(is_admin,0)=1 OR COALESCE(is_developer,0)=1) ORDER BY is_admin DESC, is_developer DESC, id ASC"
  ).all();
  return Response.json({
    me: me.id,
    accounts: rows.map((r) => ({ id: r.id, username: r.username, isAdmin: !!r.is_admin, isDeveloper: !!r.is_developer, current: r.id === me.id })),
  });
}

export async function POST(req) {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  if (!me.is_admin && !me.is_developer) return forbidden();
  const { toUserId } = await req.json();
  const target = db.prepare("SELECT id, is_admin, is_developer FROM users WHERE id=? AND deleted_at IS NULL").get(Number(toUserId));
  if (!target) return Response.json({ error: "not found" }, { status: 404 });
  if (!target.is_admin && !target.is_developer) return forbidden(); // 只能切到特权账号
  const token = createSession(target.id);
  await setSessionCookie(token);
  return Response.json({ ok: true });
}
