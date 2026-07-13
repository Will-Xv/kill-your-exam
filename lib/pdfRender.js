// PDF 渲染:把 PDF 的某一页/若干页渲染成 PNG,供多模态(读图)与扫描版 PDF 的 OCR 使用。
// 【重要】pdf-to-img 依赖原生 @napi-rs/canvas —— 用【动态 import】懒加载,避免它加载失败时把
// 引用本模块的其它路由(如 /api/daily、/api/bricks)一起拖崩;真渲染时才加载,失败就优雅降级。
async function loadPdf() { const m = await import("pdf-to-img"); return m.pdf; }

export async function pdfPageCount(buffer) {
  try { const pdf = await loadPdf(); const doc = await pdf(buffer); return doc.length || 0; } catch { return 0; }
}
export async function renderPdfPage(buffer, pageNum, scale = 2) {
  try { const pdf = await loadPdf(); const doc = await pdf(buffer, { scale }); const n = Number(pageNum); if (!n || n < 1 || n > doc.length) return null; return await doc.getPage(n); } catch { return null; }
}
export async function renderPdfPages(buffer, { pages = null, max = 25, scale = 2 } = {}) {
  const out = [];
  try {
    const pdf = await loadPdf();
    const doc = await pdf(buffer, { scale });
    const list = (pages && pages.length ? pages.map(Number).filter((p) => p >= 1 && p <= doc.length) : Array.from({ length: Math.min(doc.length, max) }, (_, i) => i + 1)).slice(0, max);
    for (const p of list) { try { const png = await doc.getPage(p); if (png) out.push({ page: p, png }); } catch {} }
  } catch {}
  return out;
}
