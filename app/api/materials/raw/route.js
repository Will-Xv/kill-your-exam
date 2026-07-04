import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { readMat } from "@/lib/files";

export async function GET(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return new Response("bad id", { status: 400 });
  const m = db.prepare("SELECT m.id, m.filename, m.mime FROM materials m JOIN exams e ON e.id=m.exam_id WHERE m.id=? AND e.user_id=?").get(id, user.id);
  if (!m) return new Response("not found", { status: 404 });
  const buf = readMat(id);
  if (!buf) return new Response("file not stored", { status: 404 });
  const name = encodeURIComponent(m.filename || `material-${id}`);
  return new Response(new Uint8Array(buf), { headers: {
    "Content-Type": m.mime || "application/octet-stream",
    "Content-Disposition": `inline; filename*=UTF-8''${name}`,
    "Cache-Control": "private, max-age=3600"
  } });
}
