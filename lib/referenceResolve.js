// 把「指针型」复习清单(题目1=教材第X页第Y题、题目2=p.42 ex.3 …)在【用户上传的教材】里逐条定位,
// 找到的原题提取出来、作为真题入题库(origin=fixed、is_real);找不到/只是相近/是扫描图的,如实报告,绝不编题。
// 供:杀手(brick resolve_reference_list)+ 手动建考试(/api/bank/resolve + 资料页按钮)共用。
import db, { familyScope, scopeSql } from "@/lib/db";
import { generateJson, langInstruction } from "@/lib/gemini";
import { locateReference, parseReference } from "@/lib/materialLocate";
import { bankAdd } from "@/lib/questionBank";

// 取某份资料的正文(拼它的 chunks);或直接用传入的 text。
function materialText(examId, materialId) {
  const rows = db.prepare(`SELECT content FROM chunks WHERE exam_id IN ${scopeSql(familyScope(examId))} AND material_id=? ORDER BY id`).all(Number(materialId));
  return rows.map((r) => r.content || "").join("\n").slice(0, 12000);
}

// 第一步:从指针清单里抽出「一条条指向教材某处的引用」。
async function extractReferences(user, src) {
  const out = await generateJson(
    `下面是一份复习清单文本。它可能是「指针型」的——每一项并不是题目本身,而是指向教材某处(如「题目1. 教材第57页第3题」「p.42 ex.3」「第五章习题5」)。
请把其中【指向教材某处的引用】逐条抽出来。label=这一条的编号/名字(如"题目1"),reference=原样的教材位置引用(如"教材第57页第3题")。
若某项本身就是完整题目(不是指针),忽略它。若整份根本不是指针清单,返回空数组。最多 60 条。` +
    langInstruction(user.lang),
    { type: "object", properties: { references: { type: "array", items: { type: "object", properties: { label: { type: "string" }, reference: { type: "string" } }, required: ["reference"] } } }, required: ["references"] }
  );
  let refs = (out && out.references) ? out.references.slice(0, 60) : [];
  // 兜底:AI 没解析出来时,按行做字面扫描——只要某行含明确的页码/题号/章节,就当成一条引用。
  if (!refs.length) {
    const lines = String(src || "").split(/\r?\n|；|;/).map((x) => x.trim()).filter((x) => x.length >= 3);
    for (const ln of lines) {
      const p = parseReference(ln);
      if (p.pages.length || p.exercises.length || p.chapters.length) {
        const label = (ln.match(/^\s*(题目?\s*\d+|Q\s*\d+|\d+)[\.、\)]/) || [])[1] || "";
        refs.push({ label, reference: ln.replace(/^\s*(题目?\s*\d+|Q\s*\d+|\d+)[\.、\)]\s*/, "").slice(0, 120) });
      }
      if (refs.length >= 60) break;
    }
  }
  return refs;
}

// 第二步:从定位到的教材原文片段里,把这道题原原本本提取成可练习的题(只用给定文本,不编造)。
async function extractQuestion(user, reference, loc) {
  const ctx = (loc.matches || []).map((m) => `【${m.filename}${m.heading ? " / " + m.heading : ""}】${m.snippet}`).join("\n\n").slice(0, 3000);
  if (!ctx) return { ok: false };
  const out = await generateJson(
    `考生的复习清单要求做这道题:「${reference}」。下面是从他上传的教材里定位到的原文片段。
请【只依据这些原文】把这道题的题目内容提取出来,做成一道可练习的题:
- stem=题目原文(尽量完整,忠于教材,别改写别扩写);qtype 取 single/multi/judge/fill/short(教材习题多为 short/简答);
- 若教材原文里带了答案,填 answer;没有就留空(留空也没关系,练习时按简答由 AI 判分)。
- 如果这些片段里【并没有真正对应「${reference}」的完整题目】(只是相近段落、或只扫到页码没题干),ok=false,不要硬编一道题出来。`,
    { type: "object", properties: { ok: { type: "boolean" }, qtype: { type: "string" }, stem: { type: "string" }, answer: { type: "string" }, explanation: { type: "string" } }, required: ["ok"] }
  );
  if (!out || !out.ok || !out.stem || String(out.stem).trim().length < 6) return { ok: false };
  return { ok: true, qtype: out.qtype || "short", stem: String(out.stem).trim(), answer: out.answer || "", explanation: out.explanation || "" };
}

// 主流程:src 二选一(text 或 materialId)。ingest=true 时把命中的题入库为真题。
export async function resolveReferenceList(user, exam, { text, materialId, markMust = false, ingest = true } = {}) {
  let src = String(text || "").trim();
  if (!src && materialId) src = materialText(exam.id, materialId);
  if (!src || src.length < 8) return { total: 0, added: 0, hits: [], misses: [], needImages: [], reason: "no_source" };

  const refs = await extractReferences(user, src.slice(0, 12000));
  if (!refs.length) return { total: 0, added: 0, hits: [], misses: [], needImages: [], reason: "not_pointer_list" };

  const hits = [], misses = [], needImages = [];
  for (const r of refs) {
    const reference = String(r.reference || "").trim(); if (!reference) continue;
    let loc; try { loc = await locateReference(exam.id, reference); } catch { loc = { status: "not_found", imageMaterials: [] }; }
    if (loc.status === "not_found") {
      if ((loc.imageMaterials || []).length) needImages.push({ label: r.label || "", reference });
      else misses.push({ label: r.label || "", reference });
      continue;
    }
    const q = await extractQuestion(user, reference, loc);
    if (!q.ok) {
      if ((loc.imageMaterials || []).length) needImages.push({ label: r.label || "", reference });
      else misses.push({ label: r.label || "", reference, note: "定位到但没提取出完整题目" });
      continue;
    }
    let questionId = null;
    if (ingest) { try { questionId = bankAdd(exam.id, { qtype: q.qtype, stem: q.stem, answer: q.answer, explanation: q.explanation, must: !!markMust }); } catch {} }
    hits.push({ label: r.label || "", reference, questionId, stem: q.stem.slice(0, 90), status: loc.status });
  }
  return { total: refs.length, added: hits.filter((h) => h.questionId).length, hits, misses, needImages };
}
