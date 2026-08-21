"use client";
// 【题目插图】把 body.figures 里的图画出来。(2026-08,Will:"我的文件里面的题目带图,结果进了模拟考图丢了")
//
// 插图有两种存法,这里都要认(见 lib/figures.js):
//   · image —— 原图整张存着,配一个 bbox;用 CSS 把画布"推"到那一块,只露出图的部分(浏览器原生,零成本)。
//   · pdf   —— 服务端已经用 CropBox 把那一页裁到只剩这张图,这里用 pdf.js 渲染成 canvas。
//     为什么非要 pdf.js:服务端转不了图(PDF→PNG 要 canvas 那类原生依赖,Railway 跑不了),
//     而直接 <iframe> 塞 PDF 会带出浏览器自带的工具栏和灰底,手机上尤其难看。
//     pdfjs 是【按需 import】的,不进首屏包;worker 用 public/ 下的静态文件,免得打包器折腾。
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/I18n";

function PdfFigure({ src, alt }) {
  const t = useT();
  const canvasRef = useRef(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ url: src }).promise;
        if (dead) return;
        const page = await doc.getPage(1);
        // 按容器宽度渲染,再乘设备像素比,免得在高分屏上糊
        const cvs = canvasRef.current;
        if (!cvs || dead) return;
        const wrapW = Math.max(200, Math.min(cvs.parentElement?.clientWidth || 320, 900));
        const base = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const scale = (wrapW / base.width) * dpr;
        const vp = page.getViewport({ scale });
        cvs.width = Math.round(vp.width); cvs.height = Math.round(vp.height);
        cvs.style.width = "100%"; cvs.style.height = "auto";
        await page.render({ canvasContext: cvs.getContext("2d"), viewport: vp }).promise;
        if (!dead) setState("ok");
      } catch { if (!dead) setState("err"); }
    })();
    return () => { dead = true; };
  }, [src]);
  return (
    <div className="relative">
      <canvas ref={canvasRef} className="block w-full rounded-lg bg-white ring-1 ring-stone-200" aria-label={alt || ""} />
      {state === "loading" && <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-stone-50/70 text-xs text-stone-400">…</div>}
      {state === "err" && <a href={src} target="_blank" rel="noreferrer" className="block rounded-lg bg-stone-50 p-3 text-center text-xs text-stone-500 underline">{alt || t("打开图片")}</a>}
    </div>
  );
}

// 图片 + bbox:用 padding-top 撑出图块的宽高比,再把整张图按比例放大、平移,让那一块正好填满。
function ImgFigure({ src, alt, bbox }) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    return <img src={src} alt={alt || ""} className="block w-full rounded-lg ring-1 ring-stone-200" />;
  }
  const [x0, y0, x1, y1] = bbox;
  const w = Math.max(0.02, x1 - x0), h = Math.max(0.02, y1 - y0);
  return (
    <div className="relative w-full overflow-hidden rounded-lg ring-1 ring-stone-200" style={{ paddingTop: `${(h / w) * 100}%` }}>
      <img src={src} alt={alt || ""} className="absolute left-0 top-0 max-w-none"
        style={{ width: `${100 / w}%`, transform: `translate(${(-x0 / w) * 100}%, ${(-y0 / h) * 100}%)` }} />
    </div>
  );
}

export default function QFigure({ figures }) {
  const t = useT();
  const list = Array.isArray(figures) ? figures.filter((f) => f && f.materialId) : [];
  if (!list.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {list.map((f, i) => {
        const src = `/api/materials/raw?id=${f.materialId}`;
        const isPdf = /pdf/i.test(f.mime || "");
        return (
          <figure key={f.materialId || i} className="m-0">
            {isPdf ? <PdfFigure src={src} alt={f.alt} /> : <ImgFigure src={src} alt={f.alt} bbox={f.bbox} />}
            {f.alt ? <figcaption className="mt-0.5 text-[11px] text-stone-400">{f.alt}</figcaption> : null}
            <a href={src} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-[11px] text-stone-400 underline">{t("看大图")}</a>
          </figure>
        );
      })}
    </div>
  );
}
