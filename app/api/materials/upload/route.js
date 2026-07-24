import db from "@/lib/db";
import { estr } from "@/lib/i18nServer";
import { requireUser, unauthorized } from "@/lib/auth";
import { parseUpload } from "@/lib/parse";
import { indexMaterial, afterMaterialsChanged } from "@/lib/rag";
import { augmentKnowledgeTree } from "@/lib/generators";
import { aiErrorResponse } from "@/lib/errors";
import { saveMat, delMat, guessMime, kindOf } from "@/lib/files";
import { autoResolveOnUpload } from "@/lib/referenceResolve";
import { assessMaterialTopic } from "@/lib/materialMatch";
import { ingestMaterialBuffer, ingestMaterialFromChunks } from "@/lib/materialIngest";
import { appendChunk, discardChunk, chunkTmpSize } from "@/lib/files";
import { refreshAssessmentBg } from "@/lib/assessRefresh";

export const maxDuration = 300;

// 【并发内存兜底】文件读进内存处理会瞬时占内存,很多人同时传大文件会叠加。
// Railway Hobby 每副本 8GB,这里设 6GB 在途上限(整实例共享),给应用其它部分(数据库/Node/别的请求)留 ~2GB:
// 超了就【体面拒绝】、让用户稍后再传,而不是任由内存叠加把整个进程 OOM 掉(那会把所有人的服务一起中断)。用 Content-Length 在读取正文【前】判断。
// 注:单文件仍有 40MB 上限,所以 6GB 实为并发上限(约上百个并发大文件才会触顶,正常用不到,主要防病态并发)。
let inFlightBytes = 0;
const UPLOAD_BUDGET = 6 * 1024 * 1024 * 1024;

export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const url = new URL(req.url);
  const examId = Number(url.searchParams.get("examId")) || exam?.id;
  if (!examId) return Response.json({ error: estr(user?.lang, "还没有创建考试") }, { status: 400 });

  // 【分块上传·文件想多大都行】前端把大文件 File.slice 切块逐块传:body=这一小块的原始字节,query 带 uploadId/i/n/name。
  // 每块直接 append 到磁盘临时文件(内存里只有一小块);收到最后一块(i==n-1)再 rename 成资料文件、从磁盘入库。
  if (url.searchParams.get("chunk")) {
    const uploadId = String(url.searchParams.get("uploadId") || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    const i = Number(url.searchParams.get("i"));
    const n = Number(url.searchParams.get("n"));
    const name = String(url.searchParams.get("name") || "file").slice(0, 200);
    const mime = String(url.searchParams.get("mime") || "");
    if (!uploadId || !Number.isInteger(i) || !Number.isInteger(n) || n < 1) return Response.json({ error: estr(user?.lang, "分块参数不对") }, { status: 400 });
    // 单块封顶(防一块塞太大爆内存);拼盘总大小也设个很宽的护栏(2GB,贴 Gemini File API 存储上限)
    const body = Buffer.from(await req.arrayBuffer());
    if (body.length > 96 * 1024 * 1024) return Response.json({ error: estr(user?.lang, "单个分块过大") }, { status: 400 });
    try {
      if (chunkTmpSize(uploadId) + body.length > 2 * 1024 * 1024 * 1024) { discardChunk(uploadId); return Response.json({ error: estr(user?.lang, "文件超过 2GB 上限") }, { status: 400 }); }
      appendChunk(uploadId, body);
      if (i < n - 1) return Response.json({ ok: true, received: i + 1, total: n });   // 还没收齐
      // 收齐 → 入库
      const r = await ingestMaterialFromChunks(examId, user, uploadId, name, mime);
      return Response.json({ ok: true, done: true, materialId: r.materialId, big: r.big });
    } catch (e) {
      try { discardChunk(uploadId); } catch {}
      const msg = String(e?.message || e).slice(0, 300);
      if (e?.isAiError || /api|quota|rate/i.test(msg)) return aiErrorResponse(e);
      return Response.json({ error: msg }, { status: 400 });
    }
  }

  const declared = Number(req.headers.get("content-length")) || 0;
  if (declared && inFlightBytes + declared > UPLOAD_BUDGET) {
    return Response.json({ error: estr(user?.lang, "服务器正在同时处理其他大文件,稍等几秒再传这一个就行(你的其它数据没受影响)。") }, { status: 503 });
  }
  inFlightBytes += declared;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file) return Response.json({ error: estr(user?.lang, "没有文件") }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > 40 * 1024 * 1024) return Response.json({ error: estr(user?.lang, "文件太大(上限 40MB)——超大 PDF(如整本规范/教材)请只截取用得到的章节再传,或把关键页转成图片上传。") }, { status: 400 });
    const r = await ingestMaterialBuffer(examId, user, buffer, file.name, file.type);
    Promise.resolve().then(() => refreshAssessmentBg(examId, user.lang)).catch(() => {});
    return Response.json({ ok: true, materialId: r.materialId, chunks: r.chunks });
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 300);
    if (e?.isAiError || /api|quota|rate/i.test(msg)) return aiErrorResponse(e);
    return Response.json({ error: msg }, { status: 400 });
  } finally {
    inFlightBytes -= declared; if (inFlightBytes < 0) inFlightBytes = 0;
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
