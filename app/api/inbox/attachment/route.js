import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { readBugDevRec } from "@/lib/files";

// 用户收件箱里的媒体附件(目前:开发者示范作答录制)。只能取属于自己的信件。
export async function GET(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const letterId = Number(new URL(req.url).searchParams.get("letter"));
  const L = db.prepare("SELECT * FROM inbox WHERE id=? AND user_id=? AND deleted_at IS NULL").get(letterId, user.id);
  if (!L || L.att_kind !== "devrec" || !L.att_ref) return forbidden();
  const buf = readBugDevRec(L.att_ref);
  if (!buf) return Response.json({ error: "not found" }, { status: 404 });
  return new Response(buf, { headers: { "Content-Type": L.att_mime || "video/webm", "Cache-Control": "private, max-age=3600" } });
}
