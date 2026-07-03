import db, { purgeUser, purgeExpiredUsers } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

// 管理员:软删除 / 恢复账号。软删除 30 天后由 purgeExpiredUsers 永久清除。
export async function POST(req) {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  if (!me.is_admin) return forbidden();
  const { action, userId } = await req.json();
  const target = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  if (!target) return Response.json({ error: "user not found" }, { status: 404 });
  if (action === "delete") {
    if (target.id === me.id) return Response.json({ error: "cannot delete yourself" }, { status: 400 });
    if (target.is_admin) return Response.json({ error: "cannot delete an admin" }, { status: 400 });
    db.prepare("UPDATE users SET deleted_at=datetime('now') WHERE id=?").run(userId);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
    return Response.json({ ok: true });
  }
  if (action === "restore") {
    db.prepare("UPDATE users SET deleted_at=NULL WHERE id=?").run(userId);
    return Response.json({ ok: true });
  }
  if (action === "purge_now") {
    if (!target.deleted_at) return Response.json({ error: "not deleted" }, { status: 400 });
    purgeUser(userId);
    return Response.json({ ok: true });
  }
  purgeExpiredUsers();
  return Response.json({ error: "unknown action" }, { status: 400 });
}
