// 【超大 PDF:拆页 + Gemini 建索引 + 只读相关页】(第二步,Will 定按此方案)
// 背景:Gemini 读 PDF 有 ~50MB/~1000页 上限;超大 PDF(如整本建筑规范)存得进来(分块上传),但整份读不了。
// 做法(不引入 pdf-parse,避免"半吊子文字误导"):
//   ①入库时:pdf-lib 把大 PDF 拆成 ≤17MB 小片,每片用【Gemini 多模态】生成一段可检索的要点(同一个好模型产出,不会误导),
//     连同【页码范围】存进 chunks(heading_path 记 "p:起-止")。→ query_knowledge_base 也能检索超大 PDF 了。
//   ②读取时:按问题检索命中相关片 → 解析出页码 → extractPdfPages 只抽那几页拼成小 PDF → 多模态读那几页(小、准、便宜)。
import db from "@/lib/db";
import fs from "fs";
import { matPath } from "@/lib/files";
import { splitPdfBySize, extractPdfPages } from "@/lib/pdfSplit";
import { readImage, embed } from "@/lib/gemini";
import { retrieve } from "@/lib/rag";

export const HUGE_PDF_BYTES = 45 * 1024 * 1024;   // 超过就当"超大 PDF":走拆页索引/拆页读,不整份喂 Gemini
const INDEX_MAX_BYTES = 250 * 1024 * 1024;         // 拆页索引时要把整份载入 pdf-lib,过大(>250MB)有内存风险 → 只存不索引

export function isHugePdf(material) {
  try {
    if (!material || material.kind !== "pdf") return false;
    const sz = fs.statSync(matPath(material.id)).size;
    return sz > HUGE_PDF_BYTES;
  } catch { return false; }
}

// 入库后台:给超大 PDF 建【按页段】的可检索索引。返回建了几段;超过 INDEX_MAX_BYTES 或拆不动返回 0。
export async function indexBigPdf(materialId, examId, lang) {
  let buf; try { buf = fs.readFileSync(matPath(materialId)); } catch { return 0; }
  if (buf.length > INDEX_MAX_BYTES) return 0;
  let pieces = [];
  try { pieces = await splitPdfBySize(buf, 16 * 1024 * 1024); } catch { return 0; }
  if (!pieces.length) return 0;
  let made = 0;
  for (const pc of pieces) {
    let summary = "";
    try {
      summary = await readImage(pc.buffer, "application/pdf",
        `这是一份大文档的第 ${pc.startPage}–${pc.endPage} 页。请用${lang && lang !== "zh" ? "该文档所用的语言" : "中文"}列出这几页的【关键主题、术语、涉及的表格/图/条款编号】,做成一段便于以后【检索定位】的要点(要包含足以判断"这几页讲什么"的关键词;别逐字抄全文,也别编页面上没有的内容)。`);
    } catch { summary = ""; }
    const txt = (summary || "").trim();
    if (txt.length < 10) continue;
    try {
      const [v] = await embed([`第${pc.startPage}-${pc.endPage}页 ${txt}`.slice(0, 6000)]);
      db.prepare("INSERT INTO chunks(material_id,exam_id,content,heading_path,embedding) VALUES(?,?,?,?,?)")
        .run(materialId, examId, txt.slice(0, 6000), `p:${pc.startPage}-${pc.endPage}`, Buffer.from(v.buffer));
      made++;
    } catch {}
  }
  return made;
}

// 解析 heading_path "p:12-20" → [12..20](封顶别太多页)
function pagesFromHeading(h, cap = 20) {
  const m = /^p:(\d+)-(\d+)$/.exec(String(h || ""));
  if (!m) return [];
  const a = Number(m[1]), b = Number(m[2]); const out = [];
  for (let p = a; p <= b && out.length < cap; p++) out.push(p);
  return out;
}

// 读取时:按问题从【本材料】的页段索引里找相关页,只抽那几页读。question 为空则读前几页概览。
export async function readBigPdf(material, examId, question, lang) {
  let buf; try { buf = fs.readFileSync(matPath(material.id)); } catch { return { ok: false, error: "文件读不出" }; }
  let pages = [];
  if (question) {
    let hits = [];
    try { hits = await retrieve(examId, question, 6); } catch {}
    for (const h of hits) {
      if (h.material_id && Number(h.material_id) !== Number(material.id)) continue;
      pages.push(...pagesFromHeading(h.heading_path));
    }
    pages = [...new Set(pages)].sort((a, b) => a - b).slice(0, 20);
  }
  if (!pages.length) pages = [1, 2, 3, 4, 5, 6, 7, 8];   // 没检索到就读前几页(至少给个概览)
  let piece; try { piece = await extractPdfPages(buf, pages); } catch { piece = null; }
  if (!piece) return { ok: false, error: "没能从这份大 PDF 里抽出相关页" };
  const instr = question
    ? `这是主人资料库里的大文件《${material.filename}》中【与他的问题最相关的第 ${pages.join("、")} 页】。请【只依据这几页】,找出并原样列清其中关于【${String(question).slice(0, 200)}】的内容(有表格/日期/条款就逐条抄清,别概括、别脑补)。若这几页没有,就如实说"这几页里没有",别编。`
    : `这是主人资料库里的大文件《${material.filename}》的前几页。请通读并把关键信息(它是什么、涵盖什么、重要日期/条款)原样提取出来。`;
  let txt = "";
  try { txt = await readImage(piece, "application/pdf", instr); } catch (e) { return { ok: false, error: "读取相关页时出错" }; }
  txt = (txt || "").trim();
  if (!txt) return { ok: false, error: "这几页没读出内容" };
  return { ok: true, pages, content: txt.slice(0, 8000) };
}
