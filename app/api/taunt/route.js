import db from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { canTauntTarget, pickSticker } from "@/lib/leaderboard";
import { notifyUser } from "@/lib/notify";

export async function GET() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const rows = db.prepare("SELECT * FROM taunts WHERE to_user=? AND resolved=0 ORDER BY id ASC").all(u.id);
  const p = rows[0];
  const canRetaunt = p ? canTauntTarget(u.id, p.from_user) : false;
  return Response.json({ count: rows.length,
    item: p ? { id: p.id, kind: p.kind, fromName: p.from_name, fromUser: p.from_user, sticker: p.sticker, canRetaunt } : null });
}

export async function POST(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { action, toUserId, id, reply } = await req.json();

  if (action === "send") {
    const target = db.prepare("SELECT id, username FROM users WHERE id=? AND deleted_at IS NULL").get(Number(toUserId));
    if (!target || target.id === u.id) return Response.json({ error: "bad target" }, { status: 400 });
    if (!canTauntTarget(u.id, target.id)) return forbidden();
    const sticker = pickSticker("taunt");
    db.prepare("INSERT INTO taunts(from_user,to_user,from_name,kind,sticker) VALUES(?,?,?,?,?)").run(u.id, target.id, u.username, "taunt", sticker);
    try { await notifyUser(target.id, "push", { title: "🗡️ 你被嘲讽了", body: `${u.username} 嘲讽了你,快打开看看`, url: "/" }); } catch {}
    return Response.json({ ok: true });
  }

  if (action === "resolve") {
    const row = db.prepare("SELECT * FROM taunts WHERE id=? AND to_user=? AND resolved=0").get(Number(id), u.id);
    if (!row) return Response.json({ ok: true });
    db.prepare("UPDATE taunts SET resolved=1 WHERE id=?").run(row.id);
    if (reply === "disdain" && row.kind === "taunt") {
      const st = pickSticker("disdain");
      db.prepare("INSERT INTO taunts(from_user,to_user,from_name,kind,sticker) VALUES(?,?,?,?,?)").run(u.id, row.from_user, u.username, "disdain", st);
      try { await notifyUser(row.from_user, "push", { title: "😒 你的嘲讽被不屑了", body: `${u.username} 对你的嘲讽表示很不屑`, url: "/" }); } catch {}
    } else if (reply === "retaunt" && row.kind === "disdain" && canTauntTarget(u.id, row.from_user)) {
      const st = pickSticker("taunt");
      db.prepare("INSERT INTO taunts(from_user,to_user,from_name,kind,sticker) VALUES(?,?,?,?,?)").run(u.id, row.from_user, u.username, "taunt", st);
      try { await notifyUser(row.from_user, "push", { title: "🗡️ 你又被嘲讽了", body: `${u.username} 再次嘲讽了你`, url: "/" }); } catch {}
    }
    return Response.json({ ok: true });
  }
  return Response.json({ error: "bad action" }, { status: 400 });
}
