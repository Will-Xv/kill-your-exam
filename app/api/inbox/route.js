import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { listInbox, unreadCount } from "@/lib/inbox";
import { notifyUser } from "@/lib/notify";

export async function GET() {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const items = listInbox(user.id);
  try {
    const pend = db.prepare("SELECT id,title FROM inbox WHERE user_id=? AND deleted_at IS NULL AND read_at IS NULL AND notified_at IS NULL AND lkey LIKE 'update-%'").all(user.id);
    if (pend.length) {
      db.prepare("UPDATE inbox SET notified_at=datetime('now') WHERE user_id=? AND notified_at IS NULL AND lkey LIKE 'update-%'").run(user.id);
      notifyUser(user.id, "updates", { title: pend[0].title || "有新更新", body: pend.length > 1 ? `${pend.length} 条新消息` : "", url: "/inbox" }).catch(() => {});
    }
  } catch {}
  return Response.json({ items, unread: unreadCount(user.id) });
}

export async function POST(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const { action, id } = await req.json().catch(() => ({}));
  if (action === "delete" && id) db.prepare("UPDATE inbox SET deleted_at=datetime('now') WHERE id=? AND user_id=?").run(id, user.id);
  else if (action === "read" && id) db.prepare("UPDATE inbox SET read_at=COALESCE(read_at,datetime('now')) WHERE id=? AND user_id=?").run(id, user.id);
  else if (action === "readAll") db.prepare("UPDATE inbox SET read_at=datetime('now') WHERE user_id=? AND read_at IS NULL AND deleted_at IS NULL").run(user.id);
  return Response.json({ ok: true, unread: unreadCount(user.id) });
}
