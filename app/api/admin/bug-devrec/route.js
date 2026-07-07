import db from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
import { readBugDevRec } from "@/lib/files";

// 回放开发者在该 bug 里「亲自试做」保存的作答录制
export async function GET(req) {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  if (!(me.is_admin || me.is_developer)) return forbidden();
  const bugId = Number(new URL(req.url).searchParams.get("bug"));
  const bug = db.prepare("SELECT dev_answer_mime FROM bug_reports WHERE id=?").get(bugId);
  const buf = readBugDevRec(bugId);
  if (!bug || !buf) return Response.json({ error: "not found" }, { status: 404 });
  return new Response(buf, { headers: { "Content-Type": bug.dev_answer_mime || "video/webm", "Cache-Control": "private, max-age=3600" } });
}
