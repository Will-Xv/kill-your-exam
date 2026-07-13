// PDF 拆分/抽页(纯 JS,pdf-lib,无原生依赖):用于把超大 PDF 拆成 ≤18MB 的小片发给 Gemini,
// 以及按引用「教材第X页」精确抽出那一页(再大的书也能只发一页)。
import { PDFDocument } from "pdf-lib";

export async function pdfPageCount(buffer) {
  try { const d = await PDFDocument.load(buffer, { ignoreEncryption: true }); return d.getPageCount(); } catch { return 0; }
}

// 抽出指定页(1-based)组成一个小 PDF;失败或无有效页返回 null。
export async function extractPdfPages(buffer, pageNums) {
  try {
    const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const n = src.getPageCount();
    const idxs = [...new Set((pageNums || []).map(Number).filter((p) => p >= 1 && p <= n).map((p) => p - 1))];
    if (!idxs.length) return null;
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, idxs);
    for (const p of pages) out.addPage(p);
    return Buffer.from(await out.save());
  } catch { return null; }
}

// 把大 PDF 按【估算大小】拆成若干 ≤maxBytes 的小片。返回 [{startPage,endPage,buffer}]。
export async function splitPdfBySize(buffer, maxBytes = 17 * 1024 * 1024) {
  const out = [];
  try {
    const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const n = src.getPageCount();
    if (!n) return out;
    const per = Math.max(1, Math.floor((maxBytes / (buffer.length / n)) * 0.85));
    for (let start = 0; start < n; start += per) {
      const idxs = []; for (let i = start; i < Math.min(start + per, n); i++) idxs.push(i);
      const doc = await PDFDocument.create();
      const pages = await doc.copyPages(src, idxs);
      for (const p of pages) doc.addPage(p);
      const buf = Buffer.from(await doc.save());
      out.push({ startPage: start + 1, endPage: start + idxs.length, buffer: buf });
      if (out.length >= 40) break; // 安全上限,别对超巨型 PDF 无限拆
    }
  } catch {}
  return out;
}
