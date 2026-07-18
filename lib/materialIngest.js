// 资料入库的【单一流水线】:保存原件 → 抽文本入 RAG(仅数字文本)→ 补知识点 → 重算覆盖/掌握 → 后台指针定位 + 主题匹配标记。
// Materials 上传页与「杀手把聊天附件存进资料库」共用同一条,保证行为一致。
import db from "@/lib/db";
import { parseUpload } from "@/lib/parse";
import { indexMaterial, afterMaterialsChanged } from "@/lib/rag";
import { augmentKnowledgeTree } from "@/lib/generators";
import { saveMat, delMat, guessMime, kindOf } from "@/lib/files";
import { autoResolveOnUpload } from "@/lib/referenceResolve";
import { assessMaterialTopic } from "@/lib/materialMatch";
import { autoMatchAssignmentDoc } from "@/lib/practical";
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
