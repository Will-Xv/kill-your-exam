// PDF 渲染:把 PDF 的某一页/若干页渲染成 PNG,供多模态(读图)与扫描版 PDF 的 OCR 使用。
// 用 pdf-to-img(pdfjs + @napi-rs/canvas,纯预编译原生,无系统依赖,Railway 可跑)。
import { pdf } from "pdf-to-img";

export async function pdfPageCount(buffer) {
  try { const doc = await pdf(buffer); return doc.length || 0; } catch { return 0; }
}
// 渲染指定页(1-based)→ PNG Buffer;失败返回 null。
export async function renderPdfPage(buffer, pageNum, scale = 2) {
  try { const doc = await pdf(buffer, { scale }); const n = Number(pageNum); if (!n || n < 1 || n > doc.length) return null; return await doc.getPage(n); } catch { return null; }
}
// 渲染多页:pages 指定页号数组;省略=前 max 页。返回 [{page, png}]。
export async function renderPdfPages(buffer, { pages = null, max = 25, scale = 2 } = {}) {
  const out = [];
  try {
    const doc = await pdf(buffer, { scale });
    const list = (pages && pages.length ? pages.map(Number).filter((p) => p >= 1 && p <= doc.length) : Array.from({ length: Math.min(doc.length, max) }, (_, i) => i + 1)).slice(0, max);
    for (const p of list) { try { const png = await doc.getPage(p); if (png) out.push({ page: p, png }); } catch {} }
  } catch {}
  return out;
}
