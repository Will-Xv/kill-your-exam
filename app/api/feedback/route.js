import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { sendEmail } from "@/lib/mail";

const OWNER_EMAIL = "xuy413682@gmail.com";

export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    const { message, attachments } = await req.json();
    const msg = (message || "").trim();
    if (!msg && !(attachments && attachments.length)) return Response.json({ error: "empty" }, { status: 400 });

    const att = (attachments || []).slice(0, 6).map((a) => ({ name: a.name, mime: a.mime, data: a.data }));
    const info = db.prepare(
      "INSERT INTO feedback(user_id,username,exam_id,message,attachments_json) VALUES(?,?,?,?,?)"
    ).run(user.id, user.username, exam?.id || null, msg, att.length ? JSON.stringify(att) : null);

    const res = await sendEmail({
      to: OWNER_EMAIL,
      subject: `[备考网站反馈] ${user.username}`,
      text: `用户:${user.username} (id ${user.id})\n考试:${exam?.name || "-"}\n时间:${new Date().toISOString()}\n\n${msg || "(仅附件)"}`,
      attachments: att,
    });
    if (res.sent) db.prepare("UPDATE feedback SET emailed=1 WHERE id=?").run(info.lastInsertRowid);

    return Response.json({ ok: true, emailed: res.sent });
  } catch (e) {
    return Response.json({ error: String(e).slice(0, 200) }, { status: 500 });
  }
}

// 管理员查看反馈列表
export async function GET() {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  if (!user.is_admin) return Response.json({ error: "forbidden" }, { status: 403 });
  const rows = db.prepare("SELECT id,username,exam_id,message,emailed,attachments_json,created_at FROM feedback ORDER BY id DESC LIMIT 200").all();
  return Response.json({ items: rows.map((r) => ({ ...r, hasAttach: !!r.attachments_json, attachments_json: undefined })) });
}
