// 【题目插图】(2026-08,Will 定:"我的文件里面的题目带图,结果进了模拟考图丢了")
//
// 以前 questions.body 只有 audioId(听力题挂音频),【没有任何图片字段】——
// 所以带图的题不管从哪来(抄自用户卷子、AI 出的看图题、联网找的真题),图一律丢失。
// 这里把"题目插图"做成一条通用管道:不管图从哪来,最后都落成【一份隐藏的图片资料】,
// 题目 body 里存 figures:[{materialId, ...}],前端一律用 /api/materials/raw?id= 显示。
//
// 各来源怎么拿到图:
//   · PDF   —— 模型报"第几页 + 归一化 bbox",用 pdf-lib 抽那一页再 setCropBox 裁到那块(纯 JS,Railway 能跑)。
//              裁出来仍是 PDF,前端用 pdf.js 渲染成画面(按需加载,不拖首屏)。
//   · 图片  —— 原图已经是图,只存 bbox,前端用 canvas 裁(浏览器原生,零依赖)。
//   · docx  —— .docx 就是个 zip,插图都在 word/media/ 下,直接解出来存成图片。
//   · 联网  —— 模型给图片 URL,后台下载存成图片(下不动就如实丢弃,不留死链)。
//
// 【隐藏资料】插图存进 materials 但打上 auto=1:不进资料列表、不建索引、不参与检索,
// 只是借用 materials 那套存储和鉴权,避免再造一套文件表。
import fs from "fs";
import zlib from "zlib";
import db from "@/lib/db";
import { matPath, saveMat, ensureMatDir } from "@/lib/files";
import { extractPdfPages } from "@/lib/pdfSplit";

const MAX_FIG_BYTES = 8 * 1024 * 1024;

// 新建一份隐藏的插图资料,返回 materialId
function newFigureMaterial(examId, filename, kind, mime, buffer) {
  const ins = db.prepare("INSERT INTO materials(exam_id,filename,kind,status,mime,stored,auto,role) VALUES(?,?,?,?,?,1,1,'figure')")
    .run(examId, String(filename).slice(0, 120), kind, "ready", mime);
  const id = ins.lastInsertRowid;
  try { ensureMatDir(); saveMat(id, buffer); } catch { try { db.prepare("DELETE FROM materials WHERE id=?").run(id); } catch {} return null; }
  return id;
}

// bbox 归一化到 0~1,并做基本清洗:顺序颠倒就交换,越界就夹紧,太小就当无效
function normBox(b) {
  if (!Array.isArray(b) || b.length !== 4) return null;
  let [x0, y0, x1, y1] = b.map(Number);
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
  if (x0 > x1) [x0, x1] = [x1, x0];
  if (y0 > y1) [y0, y1] = [y1, y0];
  const cl = (v) => Math.min(1, Math.max(0, v));
  [x0, y0, x1, y1] = [cl(x0), cl(y0), cl(x1), cl(y1)];
  if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return null;    // 比 2% 还小的框八成是模型瞎报
  return [x0, y0, x1, y1];
}

// PDF:抽出该页 → 按 bbox 裁剪 → 存成一份单页 PDF 插图
async function figureFromPdf(examId, srcMaterialId, page, bbox, label) {
  let buf; try { buf = fs.readFileSync(matPath(srcMaterialId)); } catch { return null; }
  const one = await extractPdfPages(buf, [page]);
  if (!one) return null;
  const box = normBox(bbox);
  let out = one;
  if (box) {
    try {
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.load(one, { ignoreEncryption: true });
      const pg = doc.getPage(0);
      const { width: W, height: H } = pg.getSize();
      const [x0, y0, x1, y1] = box;
      // 模型报的 y 是【从上往下】数的(它看的是图像),PDF 坐标系原点在左下 —— 这里翻过来。
      const pad = 0.012;                                   // 留一点边,别把图的描边切掉
      const px0 = Math.max(0, (x0 - pad)) * W;
      const px1 = Math.min(1, (x1 + pad)) * W;
      const pyTop = Math.max(0, (y0 - pad)) * H;
      const pyBot = Math.min(1, (y1 + pad)) * H;
      pg.setCropBox(px0, H - pyBot, Math.max(1, px1 - px0), Math.max(1, pyBot - pyTop));
      out = Buffer.from(await doc.save());
    } catch { out = one; }                                 // 裁不了就退回整页,总比没有强
  }
  if (!out || out.length > MAX_FIG_BYTES) return null;
  const id = newFigureMaterial(examId, `figure-${label || "q"}-p${page}.pdf`, "pdf", "application/pdf", out);
  return id ? { materialId: id, mime: "application/pdf", cropped: !!box } : null;
}

// 图片:原图直接复制一份当插图(带 bbox,前端裁)。复制而不是引用原资料,是为了原资料被删时题目还在。
function figureFromImage(examId, srcMaterialId, bbox, label) {
  let buf; try { buf = fs.readFileSync(matPath(srcMaterialId)); } catch { return null; }
  if (!buf.length || buf.length > MAX_FIG_BYTES) return null;
  const src = db.prepare("SELECT mime FROM materials WHERE id=?").get(srcMaterialId);
  const mime = (src && src.mime) || "image/png";
  const id = newFigureMaterial(examId, `figure-${label || "q"}.img`, "image", mime, buf);
  return id ? { materialId: id, mime, bbox: normBox(bbox) || null } : null;
}

// docx:zip 里的 word/media/ 就是全部插图。按出现顺序取第 n 张。
// mammoth 只给文字,拿不到图;这里直接读 zip —— 不引新依赖,自己解最小可用的 zip(store/deflate)。
export function docxImages(buffer) {
  const out = [];
  try {
    const b = buffer;
    // 从尾部找 End of Central Directory
    let eocd = -1;
    for (let i = b.length - 22; i >= 0 && i > b.length - 66000; i--) { if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) return out;
    const count = b.readUInt16LE(eocd + 10);
    let p = b.readUInt32LE(eocd + 16);
    for (let i = 0; i < count && p + 46 <= b.length; i++) {
      if (b.readUInt32LE(p) !== 0x02014b50) break;
      const method = b.readUInt16LE(p + 10);
      const csize = b.readUInt32LE(p + 20);
      const nameLen = b.readUInt16LE(p + 28), extraLen = b.readUInt16LE(p + 30), cmtLen = b.readUInt16LE(p + 32);
      const lho = b.readUInt32LE(p + 42);
      const name = b.slice(p + 46, p + 46 + nameLen).toString("utf8");
      p += 46 + nameLen + extraLen + cmtLen;
      if (!/^word\/media\/.+\.(png|jpe?g|gif|bmp|webp)$/i.test(name)) continue;
      try {
        const lnLen = b.readUInt16LE(lho + 26), lxLen = b.readUInt16LE(lho + 28);
        const start = lho + 30 + lnLen + lxLen;
        const raw = b.slice(start, start + csize);
        const data = method === 0 ? raw : zlib.inflateRawSync(raw);
        const ext = (name.match(/\.(\w+)$/) || [, "png"])[1].toLowerCase();
        const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : ext === "bmp" ? "image/bmp" : "image/png";
        if (data && data.length && data.length <= MAX_FIG_BYTES) out.push({ name, mime, data });
      } catch {}
    }
  } catch {}
  return out;
}

function figureFromDocxImage(examId, img, label) {
  if (!img) return null;
  const id = newFigureMaterial(examId, `figure-${label || "q"}-${(img.name || "").split("/").pop()}`, "image", img.mime, img.data);
  return id ? { materialId: id, mime: img.mime } : null;
}

// 联网找到的题带图:把图下载下来存住。下不动就返回 null(绝不把外链塞进题目——那会变死链)
export async function figureFromUrl(examId, url, label) {
  try {
    const u = String(url || "");
    if (!/^https?:\/\//i.test(u)) return null;
    const r = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const mime = (r.headers.get("content-type") || "").split(";")[0].trim();
    if (!/^image\//i.test(mime)) return null;
    const ab = await r.arrayBuffer();
    if (!ab.byteLength || ab.byteLength > MAX_FIG_BYTES) return null;
    const id = newFigureMaterial(examId, `figure-${label || "q"}-web.img`, "image", mime, Buffer.from(ab));
    return id ? { materialId: id, mime } : null;
  } catch { return null; }
}

// 抽题时统一入口:模型给的 figures 描述 → 落成真正的插图。返回可以直接写进 body.figures 的数组。
// src: { materialId, kind }(题目所在的那份资料);docxImgs:docx 场景下预先解好的图片数组。
export async function buildFigures(examId, src, figs, label, docxImgs) {
  const out = [];
  for (const f of (figs || []).slice(0, 4)) {           // 一道题最多 4 张图,够用了
    if (!f) continue;
    // src 可以是一份,也可以是一叠(上传做题能一次传好几个文件);f.file 是模型报的第几份
    const use = Array.isArray(src) ? (src[Number(f.file) || 0] || src[0]) : src;
    let made = null;
    try {
      if (f.url) made = await figureFromUrl(examId, f.url, label);
      else if (use && use.kind === "pdf" && Number(f.page) > 0) made = await figureFromPdf(examId, use.materialId, Number(f.page), f.bbox, label);
      else if (use && use.kind === "image") made = figureFromImage(examId, use.materialId, f.bbox, label);
      else if (docxImgs && docxImgs.length && Number.isFinite(Number(f.index))) made = figureFromDocxImage(examId, docxImgs[Number(f.index)], label);
    } catch {}
    if (made) out.push({ ...made, alt: String(f.alt || f.caption || "").slice(0, 200) });
  }
  return out;
}

// 题目被删/重识别时,顺手把它的插图文件也清掉,别在磁盘上留孤儿
export function dropFigures(bodyJson) {
  try {
    const figs = JSON.parse(bodyJson || "{}").figures || [];
    for (const f of figs) {
      if (!f || !f.materialId) continue;
      const m = db.prepare("SELECT role FROM materials WHERE id=?").get(f.materialId);
      if (!m || m.role !== "figure") continue;           // 只删插图,绝不碰主人自己传的资料
      try { fs.unlinkSync(matPath(f.materialId)); } catch {}
      try { db.prepare("DELETE FROM materials WHERE id=?").run(f.materialId); } catch {}
    }
  } catch {}
}
