import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { readMockAtt } from "@/lib/files";

// 提供某次模拟考某道题的作答附件(手写/上传图片),按 attemptId + 索引
export async function GET(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const sp = new URL(req.url).searchParams;
  const attempt = Number(sp.get("attempt")); const i = Number(sp.get("i") || 0);
  if (!attempt) return Response.json({ error: "bad" }, { status: 400 });
  const a = db.prepare("SELECT exam_id FROM attempts WHERE id=?").get(attempt);
  if (!a || !exam || a.exam_id !== exam.id) return forbidden();
  const arr = readMockAtt(attempt);
  if (!arr || !arr[i] || !arr[i].data) return Response.json({ error: "not found" }, { status: 404 });
  const buf = Buffer.from(arr[i].data, "base64");
  return new Response(buf, { headers: { "Content-Type": arr[i].mime || "application/octet-stream", "Cache-Control": "private, max-age=3600" } });
}
