import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { readChatFile } from "@/lib/files";

// 下载杀手生成、发给用户的文件
export async function GET(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "bad" }, { status: 400 });
  const f = db.prepare("SELECT * FROM chat_files WHERE id=?").get(id);
  if (!f || !exam || f.exam_id !== exam.id) return forbidden();
  const buf = readChatFile(id);
  if (!buf) return Response.json({ error: "not found" }, { status: 404 });
  const name = encodeURIComponent(f.filename || "file");
  return new Response(buf, {
    headers: {
      "Content-Type": (f.mime || "application/octet-stream") + "; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${name}`,
    },
  });
}
