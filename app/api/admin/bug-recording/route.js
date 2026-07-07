import db from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { readBugRec } from "@/lib/files";

// 管理员/开发者回放用户本人的录音/录像作答
export async function GET(req) {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  if (!(me.is_admin || me.is_developer)) return forbidden();
  const bugId = Number(new URL(req.url).searchParams.get("bug"));
  const bug = db.prepare("SELECT rec_mime FROM bug_reports WHERE id=?").get(bugId);
  const buf = readBugRec(bugId);
  if (!bug || !buf) return Response.json({ error: "not found" }, { status: 404 });
  return new Response(buf, { headers: { "Content-Type": bug.rec_mime || "video/webm", "Cache-Control": "private, max-age=3600" } });
}
