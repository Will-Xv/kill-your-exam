import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { saveBugRec } from "@/lib/files";

export const maxDuration = 120;

// 上传 bug 里用户本人的录音/录像作答(表演题)。只有该 bug 的提交者能传。
export async function POST(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const form = await req.formData();
  const bugId = Number(form.get("bugId"));
  const file = form.get("recording");
  const bug = db.prepare("SELECT * FROM bug_reports WHERE id=?").get(bugId);
  if (!bug || bug.user_id !== user.id) return forbidden();
  if (!file) return Response.json({ error: "no file" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  if (!buf.length || buf.length > 300 * 1024 * 1024) return Response.json({ error: "bad size" }, { status: 400 });
  try { saveBugRec(bugId, buf); } catch {}
  db.prepare("UPDATE bug_reports SET has_recording=1, rec_mime=? WHERE id=?").run(file.type || "video/webm", bugId);
  return Response.json({ ok: true });
}
