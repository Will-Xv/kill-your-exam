import db from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { getVapid, saveSubscription, removeSubscription } from "@/lib/notify";

export async function GET() {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { pub } = getVapid();
  const row = db.prepare("SELECT notif_updates, notif_bugfeedback, notif_push FROM users WHERE id=?").get(u.id) || {};
  const subCount = db.prepare("SELECT COUNT(*) n FROM push_subscriptions WHERE user_id=?").get(u.id).n;
  return Response.json({ vapidPublicKey: pub, subscribed: subCount > 0, prefs: { updates: !!row.notif_updates, bugfeedback: !!row.notif_bugfeedback, push: !!row.notif_push } });
}

export async function POST(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { subscription } = await req.json();
  saveSubscription(u.id, subscription);
  return Response.json({ ok: true });
}

export async function PATCH(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { prefs } = await req.json();
  if (prefs) {
    const map = { updates: "notif_updates", bugfeedback: "notif_bugfeedback", push: "notif_push" };
    for (const [k, col] of Object.entries(map)) if (k in prefs) db.prepare(`UPDATE users SET ${col}=? WHERE id=?`).run(prefs[k] ? 1 : 0, u.id);
  }
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { endpoint } = await req.json().catch(() => ({}));
  if (endpoint) removeSubscription(endpoint);
  return Response.json({ ok: true });
}
