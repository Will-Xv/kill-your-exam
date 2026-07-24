import db from "@/lib/db";
import { estr } from "@/lib/i18nServer";
import { requireUser, unauthorized } from "@/lib/auth";

export async function GET(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return Response.json({ error: estr(user?.lang, "缺少 id") }, { status: 400 });
  const m = db.prepare("SELECT m.id, m.filename, m.kind, m.status, m.error FROM materials m JOIN exams e ON e.id=m.exam_id WHERE m.id=? AND e.user_id=?").get(id, user.id);
  if (!m) return Response.json({ error: estr(user?.lang, "未找到") }, { status: 404 });
  const rows = db.prepare("SELECT heading_path, content FROM chunks WHERE material_id=? ORDER BY id ASC").all(id);
  const content = rows.map((r) => (r.heading_path ? `【${r.heading_path}】\n` : "") + r.content).join("\n\n");
  return Response.json({ filename: m.filename, kind: m.kind, status: m.status, error: m.error, chunks: rows.length, content });
}
