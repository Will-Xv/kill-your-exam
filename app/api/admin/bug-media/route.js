import db from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { readMat } from "@/lib/files";

// 让管理员/开发者能看到/听到某个 bug 涉及的题目媒体(图片、音频、给定音乐),与用户所见一致。
export async function GET(req) {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  if (!(me.is_admin || me.is_developer)) return forbidden();
  const sp = new URL(req.url).searchParams;
  const bugId = Number(sp.get("bug")); const mid = Number(sp.get("mid"));
  const bug = db.prepare("SELECT exam_id FROM bug_reports WHERE id=?").get(bugId);
  const mat = db.prepare("SELECT * FROM materials WHERE id=?").get(mid);
  if (!bug || !mat || mat.exam_id !== bug.exam_id) return forbidden();
  const buf = readMat(mid);
  if (!buf) return Response.json({ error: "not found" }, { status: 404 });
  return new Response(buf, { headers: { "Content-Type": mat.mime || "application/octet-stream", "Cache-Control": "private, max-age=3600" } });
}
