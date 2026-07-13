// 教材定位:把「教材第X页第Y题 / textbook p.X ex.Y / 第五章习题3」这类引用,在用户上传的资料里找出来。
// 页码/题号是【字面量】,语义向量检索找不准,所以主力是【字面扫描】,再补一层语义检索;
// 找不到就如实返回 not_found,绝不编造某页的内容。图片类资料的文字不在 chunks 里,单独列出让杀手用多模态去看。
import db, { familyScope, scopeSql } from "@/lib/db";
import { retrieve } from "@/lib/rag";

// 解析引用里的页码 / 题号 / 章节
export function parseReference(ref) {
  const s = String(ref || "");
  const pages = new Set(), exercises = new Set(), chapters = new Set();
  let m;
  const reP1 = /(?:p\.?|pg\.?|page)\s*([0-9]{1,4})/gi;
  const reP2 = /(?:第\s*)?([0-9]{1,4})\s*页/g;
  const reE1 = /(?:ex\.?|exercise|problem|prob\.?|q(?:uestion)?\.?|no\.?)\s*([0-9]{1,3}[a-z]?)/gi;
  const reE2 = /(?:习题|练习)\s*([0-9]{1,3})/g;   // 习题3 / 练习5(不吃「第42页」)
  const reE3 = /([0-9]{1,3})\s*题/g;              // 第3题 / 3题
  const reC1 = /(?:chapter|ch\.?|unit|section|§)\s*([0-9ivxlc]{1,4})/gi;
  const reC2 = /第\s*([0-9一二三四五六七八九十]{1,4})\s*(?:章|单元|节)/g;
  while ((m = reP1.exec(s))) pages.add(m[1]);
  while ((m = reP2.exec(s))) pages.add(m[1]);
  while ((m = reE1.exec(s))) exercises.add(m[1].toLowerCase());
  while ((m = reE2.exec(s))) exercises.add(m[1].toLowerCase());
  while ((m = reE3.exec(s))) exercises.add(m[1].toLowerCase());
  while ((m = reC1.exec(s))) chapters.add(m[1].toLowerCase());
  while ((m = reC2.exec(s))) chapters.add(m[1]);
  return { pages: [...pages], exercises: [...exercises], chapters: [...chapters] };
}

function pageVariants(p) { return [`p.${p}`, `p ${p}`, `pg.${p}`, `pg ${p}`, `page ${p}`, `p${p}`, `第${p}页`, `${p}页`]; }
function exVariants(e) { return [`习题${e}`, `第${e}题`, `${e}题`, `练习${e}`, `ex.${e}`, `ex ${e}`, `exercise ${e}`, `problem ${e}`, `q${e}`, `q ${e}`, `no.${e}`]; }

function snippetAround(content, needleLc) {
  const i = content.toLowerCase().indexOf(needleLc);
  if (i < 0) return content.slice(0, 200);
  const start = Math.max(0, i - 140), end = Math.min(content.length, i + 200);
  return (start > 0 ? "…" : "") + content.slice(start, end).trim() + (end < content.length ? "…" : "");
}

export async function locateReference(examId, reference) {
  const parsed = parseReference(reference);
  const rows = db.prepare(
    `SELECT c.content, c.heading_path, m.filename, m.kind FROM chunks c JOIN materials m ON m.id=c.material_id
     WHERE c.exam_id IN ${scopeSql(familyScope(examId))} AND m.status='ready'`
  ).all();

  const pageVs = parsed.pages.flatMap(pageVariants).map((v) => v.toLowerCase());
  const exVs = parsed.exercises.flatMap(exVariants).map((v) => v.toLowerCase());
  const matches = [];
  for (const r of rows) {
    const lc = (r.content || "").toLowerCase();
    const hitPage = pageVs.find((v) => lc.includes(v));
    const hitEx = exVs.find((v) => lc.includes(v));
    if (!hitPage && !hitEx) continue;
    const strength = (hitPage ? 1 : 0) + (hitEx ? 1 : 0);
    matches.push({
      filename: r.filename, heading: r.heading_path || "",
      snippet: snippetAround(r.content, (hitEx || hitPage)),
      why: [hitPage && `页码「${hitPage}」`, hitEx && `题号「${hitEx}」`].filter(Boolean).join(" + "),
      strength,
    });
  }
  matches.sort((a, b) => b.strength - a.strength);

  let semantic = [];
  try { semantic = (await retrieve(examId, reference, 4)).map((h) => ({ filename: h.filename, heading: h.heading_path || "", snippet: (h.content || "").slice(0, 200), score: +h.score.toFixed(2) })); } catch {}

  const imageMaterials = db.prepare(
    `SELECT DISTINCT m.filename FROM materials m WHERE m.exam_id IN ${scopeSql(familyScope(examId))} AND m.status='ready' AND m.kind='image'`
  ).all().map((x) => x.filename);

  const hasRef = parsed.pages.length || parsed.exercises.length || parsed.chapters.length;
  let status = "not_found";
  if (matches.length) status = matches[0].strength >= 2 ? "found" : "partial";
  else if (semantic.length) status = "partial";

  let note;
  if (!hasRef) note = "这条引用里没解析出明确的页码/题号/章节,我按整体语义检索了资料。";
  else if (status === "not_found") note = `在你上传的资料文本里没找到 ${reference} 对应的位置。可能:资料没覆盖那页、页码/题号没被识别成文字(比如是图片扫描件)。${imageMaterials.length ? `有 ${imageMaterials.length} 份图片资料我可以直接看:${imageMaterials.slice(0, 5).join("、")}。` : ""}`;
  else if (status === "partial") note = "只找到部分线索(单独命中页码或题号,或仅语义相近),不能百分百确定就是它,请你核对一下。";
  else note = "找到了较有把握的匹配。";

  return { reference, parsed, status, matches: matches.slice(0, 6), semantic, imageMaterials, note };
}
