// 把【很高的手写长图】切成几张便于识别的图。手写区域可以无限拉长,拉得越长整张图越"又窄又高",
// 多模态模型对这种长条图会整体降采样、字迹变糊——所以超过一定比例就额外附上切片。
//
// ★两种切法【逐个切口各自判断】,不是二选一:
//   ① 直接切(优先):在目标切点附近找一段【完全没墨的空白行】,从那道缝里下刀——切口干净、没有任何重复。
//   ② 重叠切(兜底):这一处实在找不到缝(竖式演算、跨行大括号、连笔),才让上下两张各多带一段,
//      保证跨切口的笔画至少在其中一张里是完整的。代价是重叠部分出现两次,所以判卷提示里会说明"别重复计分"。
//
// 注意:整张原图【始终照常提交】,切片只是【额外】附上。用整张还是用切片,由判卷模型自己挑
//(它拿到的是"全局一张 + 清晰几张"),代码不替它做这个决定。

const SPLIT_ASPECT = 1.6;   // 高 > 宽×1.6 才算长图,才需要切
const SLICE_ASPECT = 1.1;   // 每片目标高度 ≈ 宽×1.1(接近方形,最利于识别)
const INK_LEVEL = 200;      // 亮度低于此算"有墨"(底色是纯白)
const MIN_GAP = 6;          // 空白缝至少这么多行才算一道可用的缝

function loadImage(dataURL) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("image load failed"));
    im.src = dataURL;
  });
}

// 每一行的墨量(有多少个深色像素)
function inkPerRow(ctx, w, h) {
  const rows = new Int32Array(h);
  const d = ctx.getImageData(0, 0, w, h).data;
  for (let y = 0; y < h; y++) {
    let n = 0;
    const base = y * w * 4;
    for (let x = 0; x < w; x++) {
      const i = base + x * 4;
      // 简易亮度;顺带跳过全透明像素
      if (d[i + 3] > 8 && (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) < INK_LEVEL) n++;
    }
    rows[y] = n;
  }
  return rows;
}

// 在 target 附近的窗口里找【最长的一段空白行】,返回它的中点;找不到返回 null。
function findBlankCut(rows, target, win) {
  const lo = Math.max(1, target - win), hi = Math.min(rows.length - 2, target + win);
  let best = null, runStart = -1;
  for (let y = lo; y <= hi + 1; y++) {
    const blank = y <= hi && rows[y] === 0;
    if (blank) { if (runStart < 0) runStart = y; }
    else if (runStart >= 0) {
      const len = y - runStart;
      if (len >= MIN_GAP) {
        const mid = runStart + (len >> 1);
        // 同样长的缝,取离目标切点更近的
        if (!best || len > best.len || (len === best.len && Math.abs(mid - target) < Math.abs(best.y - target))) best = { y: mid, len };
      }
      runStart = -1;
    }
  }
  return best ? best.y : null;
}

// 返回 [{name,mime,data,overlapped}];不需要切(或出错)就返回 []。
export async function splitHandwriting(dataURL) {
  if (!dataURL || typeof document === "undefined") return [];
  const im = await loadImage(dataURL);
  const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
  if (!w || !h || h <= w * SPLIT_ASPECT) return [];              // 不够高,不用切
  // 【不封顶】拉长次数不限,切片张数也就不设上限——张数随高度自然增长(每片高度≈宽度),
  // 人为封顶只会让超长图的每一片重新变成又高又糊的长条,等于白切。
  const n = Math.max(2, Math.ceil(h / (w * SLICE_ASPECT)));

  const src = document.createElement("canvas");
  src.width = w; src.height = h;
  const sctx = src.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(im, 0, 0);

  let rows;
  try { rows = inkPerRow(sctx, w, h); } catch { return []; }      // 跨域污染等 → 放弃切片,整张照常提交

  const step = h / n;
  const win = Math.round(step * 0.25);                            // 允许切口在目标位置上下浮动这么多
  const OV = Math.max(24, Math.round(Math.min(h * 0.06, w * 0.15))); // 兜底重叠量
  const cuts = [];
  for (let i = 1; i < n; i++) {
    const target = Math.round(i * step);
    const y = findBlankCut(rows, target, win);
    cuts.push(y != null ? { y, blank: true } : { y: target, blank: false });
  }

  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = i === 0 ? null : cuts[i - 1];
    const next = i === n - 1 ? null : cuts[i];
    const top = !prev ? 0 : (prev.blank ? prev.y : Math.max(0, prev.y - OV));
    const bottom = !next ? h : (next.blank ? next.y : Math.min(h, next.y + OV));
    const sh = bottom - top;
    if (sh <= 1) continue;
    const c = document.createElement("canvas");
    c.width = w; c.height = sh;
    const cx = c.getContext("2d");
    cx.fillStyle = "#ffffff"; cx.fillRect(0, 0, w, sh);
    cx.drawImage(src, 0, top, w, sh, 0, 0, w, sh);
    const url = c.toDataURL("image/png");
    out.push({
      name: `handwriting-p${i + 1}of${n}.png`, mime: "image/png", data: url.split(",")[1],
      overlapped: !!((prev && !prev.blank) || (next && !next.blank)),
    });
  }
  return out.length > 1 ? out : [];
}
