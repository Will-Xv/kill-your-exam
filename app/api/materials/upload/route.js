import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { parseUpload } from "@/lib/parse";
import { indexMaterial, afterMaterialsChanged } from "@/lib/rag";
import { augmentKnowledgeTree } from "@/lib/generators";
import { aiErrorResponse } from "@/lib/errors";
import { saveMat, delMat, guessMime, kindOf } from "@/lib/files";
import { autoResolveOnUpload } from "@/lib/referenceResolve";
import { readImage } from "@/lib/gemini";
import { splitPdfBySize } from "@/lib/pdfSplit";

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

  const mime = guessMime(file.name, file.type);
  const kind = kindOf(file.name, mime);
  const ins = db.prepare("INSERT INTO materials(exam_id,filename,kind,status,mime,stored) VALUES(?,?,?,?,?,0)")
    .run(examId, file.name, kind, "processing", mime);
  const materialId = ins.lastInsertRowid;
  try {
    // 永远保留原始文件(图/音/PDF 等,供查看与 Gemini 多模态读取)
    saveMat(materialId, buffer);
    db.prepare("UPDATE materials SET stored=1 WHERE id=?").run(materialId);

    // 文本可提取的仍然入库(用于检索);图片顺带 OCR;音频不强制提取
    let chunks = 0;
    if (kind !== "audio") {
      try {
        const { text } = await parseUpload(file.name, buffer, mime);
        if (text && text.trim().length >= 30) chunks = await indexMaterial(materialId, examId, text, file.name.replace(/\.\w+$/, ""));
      } catch (e) {
        if (e?.isAiError) throw e; // API/额度类错误照常提示
        // 其它解析失败:原始文件已保存,静默跳过文本入库
      }
    }
    db.prepare("UPDATE materials SET status='ready' WHERE id=?").run(materialId);
    try { const exRow = db.prepare("SELECT id FROM exams WHERE id=?").get(examId); if (exRow) await augmentKnowledgeTree(exRow, user.lang); } catch {} // 按新资料补充知识点(学习目标增)
    await afterMaterialsChanged(examId); // 重算覆盖度/掌握度 + 刷新今日计划
    // 若这份(或已有资料)是「指针清单」,后台自动在教材里定位并把真题入库,结果进首页横幅(不阻塞上传返回)。
    Promise.resolve().then(() => autoResolveOnUpload(user, examId, materialId)).catch(() => {});
    // 扫描版 PDF(pdf-parse 抽不出文字)→ 后台交给 Gemini 原生读:转写文字 + 描述示意图,保留页码,入库供检索。
    // >18MB(Gemini 单次上限)→ 用 pdf-lib 按大小拆成小片,逐片读、拼起来,再大的书也能读。
    if (kind === "pdf" && !chunks) {
      Promise.resolve().then(async () => {
        const PROMPT = "这是一份 PDF 教材(可能是扫描件)。把它的内容转成便于检索的文本:①逐页完整转写页面上的所有文字(每页开头标注「第N页 / Page N」,保留题号/条目结构);②对页里的示意图/图表/流程图/插图,用简短文字描述它画了什么、关键组成与关系。只输出这些内容,不要额外说明。";
        try {
          let combined = "";
          if (buffer.length <= 50 * 1024 * 1024) { // File API 读整份 PDF(上限 50MB/1000 页)
            const tt = await readImage(buffer, "application/pdf", PROMPT); if (tt) combined = tt.trim();
          } else {
            const slices = await splitPdfBySize(buffer, 45 * 1024 * 1024); // >50MB 才拆,每片≤45MB(File API 上传)
            for (const sl of slices) { try { const tt = await readImage(sl.buffer, "application/pdf", `${PROMPT}\n(这是原书第 ${sl.startPage}–${sl.endPage} 页)`); if (tt && tt.trim()) combined += `\n\n${tt.trim()}`; } catch {} }
          }
          if (combined.trim().length >= 30) { await indexMaterial(materialId, examId, combined.trim(), file.name.replace(/\.\w+$/, "")); await afterMaterialsChanged(examId); }
        } catch {}
      }).catch(() => {});
    }
    return Response.json({ ok: true, materialId, chunks });
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 300);
    db.prepare("UPDATE materials SET status='failed', error=? WHERE id=?").run(msg, materialId);
    delMat(materialId);
    db.prepare("DELETE FROM materials WHERE id=?").run(materialId);
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
    if (m.exam_id) await afterMaterialsChanged(m.exam_id);
  }
  return Response.json({ ok: true });
}
