import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { parseUpload } from "@/lib/parse";
import { indexMaterial, afterMaterialsChanged } from "@/lib/rag";
import { augmentKnowledgeTree } from "@/lib/generators";
import { aiErrorResponse } from "@/lib/errors";
import { saveMat, delMat, guessMime, kindOf } from "@/lib/files";
import { autoResolveOnUpload } from "@/lib/referenceResolve";
import { assessMaterialTopic } from "@/lib/materialMatch";
import { ingestMaterialBuffer } from "@/lib/materialIngest";
import { refreshAssessmentBg } from "@/lib/assessRefresh";

export const maxDuration = 300;

export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const url = new URL(req.url);
  const examId = Number(url.searchParams.get("examId")) || exam?.id;
  if (!examId) return Response.json({ error: "还没有创建考试" }, { status: 400 });

  const form = await req.formData();
  const file = form.get("file");
  if (!file) return Response.json({ error: "没有文件" }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > 40 * 1024 * 1024) return Response.json({ error: "文件太大(上限 40MB)" }, { status: 400 });

  try {
    const r = await ingestMaterialBuffer(examId, user, buffer, file.name, file.type);
    Promise.resolve().then(() => refreshAssessmentBg(examId, user.lang)).catch(() => {});   // 后台:上传后刷新认知自评(缺口随资料补齐)
    return Response.json({ ok: true, materialId: r.materialId, chunks: r.chunks });
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 300);
    if (e?.isAiError || /api|quota|rate/i.test(msg)) return aiErrorResponse(e);
    return Response.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req) {
  const { user } = await requireUser();
  if (!user) return unauthorized();
  const { id } = await req.json();
  const m = db.prepare("SELECT m.id, m.exam_id FROM materials m JOIN exams e ON e.id=m.exam_id WHERE m.id=? AND e.user_id=?").get(id, user.id);
  if (m) {
    db.prepare("DELETE FROM chunks WHERE material_id=?").run(id);
    db.prepare("DELETE FROM materials WHERE id=?").run(id);
    delMat(id);
    if (m.exam_id) { await afterMaterialsChanged(m.exam_id); Promise.resolve().then(() => refreshAssessmentBg(m.exam_id, user.lang)).catch(() => {}); }
  }
  return Response.json({ ok: true });
}
