import db from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { GUIDE_VERSION } from "@/lib/guide";
import { syncInbox, markLetterRead } from "@/lib/inbox";

export async function POST(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { type, read } = await req.json().catch(() => ({}));
  if (type === "tour") {
    // 新用户:更新公告对他不算"新",标记已读(欢迎信仍未读);新手导引本身不产生未读
    syncInbox(u.id); markLetterRead(u.id, `update-v${GUIDE_VERSION}`);
    db.prepare("UPDATE users SET onboarded=1, guide_version=? WHERE id=?").run(GUIDE_VERSION, u.id);
  } else if (type === "whatsnew") {
    // 先按未读投递这版更新信(此时 guide_version 仍小于当前版),看完才标已读,跳过则保持未读
    syncInbox(u.id);
    if (read) markLetterRead(u.id, `update-v${GUIDE_VERSION}`);
    db.prepare("UPDATE users SET guide_version=?, onboarded=1 WHERE id=?").run(GUIDE_VERSION, u.id);
  }
  return Response.json({ ok: true });
}
