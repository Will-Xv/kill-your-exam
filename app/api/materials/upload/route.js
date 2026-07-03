import db, { getActiveExam } from "@/lib/db";
import { parseUpload } from "@/lib/parse";
import { indexMaterial } from "@/lib/rag";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 300;

export async function POST(req) {
  const exam = getActiveExam();
  // onboarding 期间也可传 examId
  const url = new URL(req.url);
  const examId = Number(url.searchParams.get("examId")) || exam?.id;
  if (!examId) return Response.json({ error: "还没有创建考试" }, { status: 400 });

  const form = await req.formData();
  const file = form.get("file");
  if (!file) return Response.json({ error: "没有文件" }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > 40 * 1024 * 1024) return Response.json({ error: "文件太大(上限 40MB)" }, { status: 400 });

  const ins = db.prepare("INSERT INTO materials(exam_id,filename,kind,status) VALUES(?,?,?,?)")
    .run(examId, file.name, "processing", "processing");
  const materialId = ins.lastInsertRowid;
  try {
    const { kind, text } = await parseUpload(file.name, buffer, file.type);
    if (!text || text.trim().length < 30) throw new Error("解析后没有有效文字内容(可能是扫描版 PDF,请转成图片逐页上传)");
    const n = await indexMaterial(materialId, examId, text, file.name.replace(/\.\w+$/, ""));
    db.prepare("UPDATE materials SET kind=?, status='ready' WHERE id=?").run(kind, materialId);
    return Response.json({ ok: true, materialId, chunks: n });
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 300);
    db.prepare("UPDATE materials SET status='failed', error=? WHERE id=?").run(msg, materialId);
    if (e?.isAiError || /api|quota|rate/i.test(msg)) return aiErrorResponse(e);
    return Response.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req) {
  const { id } = await req.json();
  db.prepare("DELETE FROM chunks WHERE material_id=?").run(id);
  db.prepare("DELETE FROM materials WHERE id=?").run(id);
  return Response.json({ ok: true });
}
