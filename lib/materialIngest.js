// 资料入库的【单一流水线】:保存原件 → 抽文本入 RAG(仅数字文本)→ 补知识点 → 重算覆盖/掌握 → 后台指针定位 + 主题匹配标记。
// Materials 上传页与「杀手把聊天附件存进资料库」共用同一条,保证行为一致。
import db from "@/lib/db";
import { parseUpload } from "@/lib/parse";
import { indexMaterial, afterMaterialsChanged } from "@/lib/rag";
import { augmentKnowledgeTree } from "@/lib/generators";
import fs from "fs";
import { saveMat, delMat, guessMime, kindOf, matPath, finalizeChunkTo, discardChunk } from "@/lib/files";
import { autoResolveOnUpload } from "@/lib/referenceResolve";
import { assessMaterialTopic } from "@/lib/materialMatch";
import { autoMatchAssignmentDoc } from "@/lib/practical";
import { indexBigPdf } from "@/lib/pdfIndex";
import { sendLetter } from "@/lib/inbox";

export async function ingestMaterialBuffer(examId, user, buffer, filename, mimeHint) {
  const mime = guessMime(filename, mimeHint);
  const kind = kindOf(filename, mime);
  const ins = db.prepare("INSERT INTO materials(exam_id,filename,kind,status,mime,stored) VALUES(?,?,?,?,?,0)")
    .run(examId, filename, kind, "processing", mime);
  const materialId = ins.lastInsertRowid;
  try {
    saveMat(materialId, buffer);
    db.prepare("UPDATE materials SET stored=1 WHERE id=?").run(materialId);
    let chunks = 0, parsedText = "";
    if (kind !== "audio") {
      try {
        const { text } = await parseUpload(filename, buffer, mime);
        parsedText = text || "";
        if (text && text.trim().length >= 30) chunks = await indexMaterial(materialId, examId, text, filename.replace(/\.\w+$/, ""));
      } catch (e) { if (e?.isAiError) throw e; }
    }
    db.prepare("UPDATE materials SET status='ready' WHERE id=?").run(materialId);
    try { const exRow = db.prepare("SELECT id FROM exams WHERE id=?").get(examId); if (exRow) await augmentKnowledgeTree(exRow, user.lang); } catch {}
    await afterMaterialsChanged(examId);
    Promise.resolve().then(() => autoResolveOnUpload(user, examId, materialId)).catch(() => {});
    Promise.resolve().then(async () => {
      try {
        const exRow = db.prepare("SELECT id, name FROM exams WHERE id=?").get(examId);
        if (!exRow) return;
        const res = await assessMaterialTopic(exRow, { text: parsedText, buffer, mime, kind }, user.lang);
        const flag = res && res.verdict === "mismatch" ? 1 : res && res.verdict === "unsure" ? 2 : res && res.verdict === "partial" ? 3 : 0;
        db.prepare("UPDATE materials SET offtopic=?, offtopic_reason=? WHERE id=?").run(flag, String((res && res.reason) || "").slice(0, 300), materialId);
      } catch {}
    }).catch(() => {});
    // 后台:若这份文档是某个已有作业助手作业的具体要求,自动更新到【那一个】作业(只改匹配上的那个),并通知主人
    Promise.resolve().then(async () => {
      try {
        if (!parsedText || parsedText.trim().length < 40) return;
        const exRow = db.prepare("SELECT id, name FROM exams WHERE id=?").get(examId);
        if (!exRow) return;
        const m = await autoMatchAssignmentDoc(exRow, parsedText, user.lang);
        if (m && m.taskId) { try { sendLetter(user.id, { title: "📝 作业要求已更新", body: `你上传的《${filename}》已识别为「${m.title}」的要求,作业助手现在知道这份作业了。`, key: `assign-upd-${m.taskId}-${materialId}` }); } catch {} }
      } catch {}
    }).catch(() => {});
    return { ok: true, materialId, filename, chunks, kind };
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 300);
    try { db.prepare("UPDATE materials SET status='failed', error=? WHERE id=?").run(msg, materialId); } catch {}
    try { delMat(materialId); } catch {}
    try { db.prepare("DELETE FROM materials WHERE id=?").run(materialId); } catch {}
    throw e;
  }
}


// 【分块上传收尾·从磁盘入库】文件已被分块拼在临时文件里,这里把它 rename 成资料文件(同卷、零内存拷贝),再做后处理。
// ★超大文件(超过 Gemini 单份 PDF 处理上限)只【存】不【整份读】:不抽文字、不做多模态主题匹配(那会把整份读进内存传给 Gemini,既爆内存又超它的页数上限),
//   等第二步"拆页 + 建索引"上线后再让杀手按页读。存进来这一步任何大小都 OK。
const BIG_READ_LIMIT = 48 * 1024 * 1024;
export async function ingestMaterialFromChunks(examId, user, uploadId, filename, mimeHint) {
  const mime = guessMime(filename, mimeHint);
  const kind = kindOf(filename, mime);
  const ins = db.prepare("INSERT INTO materials(exam_id,filename,kind,status,mime,stored) VALUES(?,?,?,?,?,0)")
    .run(examId, filename, kind, "processing", mime);
  const materialId = ins.lastInsertRowid;
  try {
    finalizeChunkTo(uploadId, matPath(materialId));   // 临时文件 → 资料文件(rename,不进内存)
    db.prepare("UPDATE materials SET stored=1 WHERE id=?").run(materialId);
    let size = 0; try { size = fs.statSync(matPath(materialId)).size; } catch {}
    const tooBigToRead = size > BIG_READ_LIMIT;

    let chunks = 0, parsedText = "";
    if (!tooBigToRead && kind !== "audio") {
      try {
        const buf = fs.readFileSync(matPath(materialId));
        const { text } = await parseUpload(filename, buf, mime);
        parsedText = text || "";
        if (text && text.trim().length >= 30) chunks = await indexMaterial(materialId, examId, text, filename.replace(/\.\w+$/, ""));
      } catch (e) { if (e?.isAiError) throw e; }
    }
    db.prepare("UPDATE materials SET status='ready' WHERE id=?").run(materialId);
    try { const exRow = db.prepare("SELECT id FROM exams WHERE id=?").get(examId); if (exRow) await augmentKnowledgeTree(exRow, user.lang); } catch {}
    await afterMaterialsChanged(examId);
    Promise.resolve().then(() => autoResolveOnUpload(user, examId, materialId)).catch(() => {});
    // 【超大 PDF:后台建拆页索引】整份读不了(超 Gemini 上限),就拆片让 Gemini 逐片生成可检索要点(带页码),
    // 之后 query_knowledge_base 能检索、read_material 能只读相关页。这一步在后台跑,不阻塞上传返回。
    if (tooBigToRead && kind === "pdf") {
      Promise.resolve().then(async () => { try { await indexBigPdf(materialId, examId, user.lang); await afterMaterialsChanged(examId); } catch {} }).catch(() => {});
    }
    // 主题匹配:只对能读的文件做(超大不做,避免整份进内存;它的 offtopic 保持默认0=不打标)
    if (!tooBigToRead) {
      Promise.resolve().then(async () => {
        try {
          const exRow = db.prepare("SELECT id, name FROM exams WHERE id=?").get(examId);
          if (!exRow) return;
          const buf = fs.readFileSync(matPath(materialId));
          const res = await assessMaterialTopic(exRow, { text: parsedText, buffer: buf, mime, kind }, user.lang);
          const flag = res && res.verdict === "mismatch" ? 1 : res && res.verdict === "unsure" ? 2 : res && res.verdict === "partial" ? 3 : 0;
          db.prepare("UPDATE materials SET offtopic=?, offtopic_reason=? WHERE id=?").run(flag, String((res && res.reason) || "").slice(0, 300), materialId);
        } catch {}
      }).catch(() => {});
    }
    return { ok: true, materialId, filename, chunks, kind, big: tooBigToRead };
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 300);
    try { db.prepare("UPDATE materials SET status='failed', error=? WHERE id=?").run(msg, materialId); } catch {}
    try { delMat(materialId); } catch {}
    try { db.prepare("DELETE FROM materials WHERE id=?").run(materialId); } catch {}
    throw e;
  }
}
