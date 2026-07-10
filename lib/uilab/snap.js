"use client";
// 自动对齐:拖动/改宽时,把移动元素的边/中线吸附到其它元素的边/中线,并给出参考线。
// 所有元素都用视口坐标(getBoundingClientRect),因此首页块、导航栏、杀手卡片可互相对齐。
const THR = 6;

export function collectRects(selfEl) {
  const out = [];
  if (typeof document === "undefined") return out;
  document.querySelectorAll("[data-snap]").forEach((el) => {
    if (el === selfEl) return;
    const r = el.getBoundingClientRect();
    out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
  });
  return out;
}

// 给定移动后的视口矩形,返回需要再平移的 dx/dy(吸附量)与参考线
function snapRect(rect, others, thr = THR) {
  const sX = [rect.left, rect.left + rect.width / 2, rect.left + rect.width];
  const sY = [rect.top, rect.top + rect.height / 2, rect.top + rect.height];
  let bx = null, by = null;
  for (const o of others) {
    const oX = [o.left, o.cx, o.right], oY = [o.top, o.cy, o.bottom];
    for (const s of sX) for (const t of oX) { const d = t - s; if (Math.abs(d) <= thr && (bx == null || Math.abs(d) < Math.abs(bx.d))) bx = { d, line: t }; }
    for (const s of sY) for (const t of oY) { const d = t - s; if (Math.abs(d) <= thr && (by == null || Math.abs(d) < Math.abs(by.d))) by = { d, line: t }; }
  }
  const guides = [];
  if (bx) guides.push({ x: bx.line });
  if (by) guides.push({ y: by.line });
  return { dx: bx ? bx.d : 0, dy: by ? by.d : 0, guides };
}

// 移动:startRect=按下时的视口矩形,dxRaw/dyRaw=鼠标位移;返回吸附后的总位移与参考线
export function snapMove(startRect, dxRaw, dyRaw, others, thr = THR) {
  const r = { left: startRect.left + dxRaw, top: startRect.top + dyRaw, width: startRect.width, height: startRect.height };
  const { dx, dy, guides } = snapRect(r, others, thr);
  return { dx: dxRaw + dx, dy: dyRaw + dy, guides };
}

// 单边吸附(改宽用):把某条竖线 value 吸附到其它元素最近的竖线
export function snapEdgeX(value, others, thr = THR) {
  let best = null;
  for (const o of others) for (const t of [o.left, o.cx, o.right]) { const d = t - value; if (Math.abs(d) <= thr && (best == null || Math.abs(d) < Math.abs(best.d))) best = { d, line: t }; }
  return best ? { value: best.line, guide: { x: best.line } } : { value, guide: null };
}
export function snapEdgeY(value, others, thr = THR) {
  let best = null;
  for (const o of others) for (const t of [o.top, o.cy, o.bottom]) { const d = t - value; if (Math.abs(d) <= thr && (best == null || Math.abs(d) < Math.abs(best.d))) best = { d, line: t }; }
  return best ? { value: best.line, guide: { y: best.line } } : { value, guide: null };
}
