import db, { purgeExpiredBugs } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { sendLetter } from "@/lib/inbox";
import { notifyUser } from "@/lib/notify";

function staff(me) { return me && (me.is_admin || me.is_developer); }

export async function GET() {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  if (!staff(me)) return forbidden();
  purgeExpiredBugs();
  const rows = db.prepare("SELECT * FROM bug_reports ORDER BY (deleted_at IS NOT NULL), id DESC LIMIT 300").all();
  const bugs = rows.map((r) => { let snap = {}; try { snap = JSON.parse(r.snapshot || "{}"); } catch {}
    return { id: r.id, examName: snap.examName || "", username: r.username, userId: r.user_id, questionId: r.question_id, qtype: r.qtype, userNote: r.user_note || "", status: r.status, adminNote: r.admin_note || "", createdAt: r.created_at, deletedAt: r.deleted_at, hasRecording: !!r.has_recording, recMime: r.rec_mime || "", snapshot: snap }; });
  return Response.json({ bugs });
}

export async function POST(req) {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  if (!staff(me)) return forbidden();
  const { id, action, note, letterTitle, letterBody } = await req.json();
  const bug = db.prepare("SELECT * FROM bug_reports WHERE id=?").get(id);
  if (!bug) return Response.json({ error: "not found" }, { status: 404 });
  if (action === "note") db.prepare("UPDATE bug_reports SET admin_note=? WHERE id=?").run((note || "").slice(0, 4000), id);
  else if (action === "done") db.prepare("UPDATE bug_reports SET status='done' WHERE id=?").run(id);
  else if (action === "open") db.prepare("UPDATE bug_reports SET status='open' WHERE id=?").run(id);
  else if (action === "delete") db.prepare("UPDATE bug_reports SET deleted_at=datetime('now') WHERE id=?").run(id);
  else if (action === "restore") db.prepare("UPDATE bug_reports SET deleted_at=NULL WHERE id=?").run(id);
  else if (action === "letter") {
    if (bug.user_id && letterBody) {
      sendLetter(bug.user_id, { title: (letterTitle || "📩 关于你反馈的问题").slice(0, 120), body: String(letterBody).slice(0, 4000), key: `bugreply-${id}-${Date.now()}` });
      try { await notifyUser(bug.user_id, "bugfeedback", { title: letterTitle || "关于你反馈的问题", body: "开发者回复了你反馈的问题" }); } catch {}
    }
  }
  return Response.json({ ok: true });
}
