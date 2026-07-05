import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { listInbox, unreadCount } from "@/lib/inbox";

export async function GET() {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  return Response.json({ items: listInbox(user.id), unread: unreadCount(user.id) });
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
