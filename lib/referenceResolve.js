// 把「指针型」复习清单(题目1=教材第X页第Y题、题目2=p.42 ex.3 …)在【用户上传的教材】里逐条定位,
// 找到的原题提取出来、作为真题入题库(origin=fixed、is_real);找不到/只是相近/是扫描图的,如实报告,绝不编题。
// 供:杀手(brick resolve_reference_list)+ 手动建考试(/api/bank/resolve + 资料页按钮)共用。
import db, { familyScope, scopeSql, getSetting, setSetting } from "@/lib/db";
import { generateJson, langInstruction, generate } from "@/lib/gemini";
import { locateReference, parseReference } from "@/lib/materialLocate";
import { bankAdd } from "@/lib/questionBank";
import { readMat } from "@/lib/files";

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
async function extractQuestion(user, exam, reference, loc) {
  const ctx = (loc.matches || []).map((m) => `【${m.filename}${m.heading ? " / " + m.heading : ""}】${m.snippet}`).join("\n\n").slice(0, 3000);
  if (!ctx) return { ok: false };
  const examLang = exam.exam_lang || user.lang || "";
  const out = await generateJson(
    `考生的复习清单要求做这道题:「${reference}」。下面是从他上传的教材里定位到的原文片段(可能包含相邻的其它题)。
请【只依据这些原文】,把【正好对应「${reference}」的那一道题】提取出来,做成一道干净、可练习的题:
- 【只取这一道】:如果片段里有多道题/多个页码题号,只保留与「${reference}」匹配的那一道,别把相邻的题、页码标记、"教材摘录"之类的标题一起塞进 stem。
- 【语言】:stem 必须用${examLang ? "这门考试的语言(" + examLang + ")" : "这门考试的语言"}表述——教材原文若已是该语言就原样保留、忠于原文;若是别的语言则翻译成该语言(这是给该考试练习用的题)。
- qtype 取 single/multi/judge/fill/short(教材习题多为 short/简答);教材带答案就填 answer,没有就留空。
- 如果片段里【并没有真正对应「${reference}」的完整题目】(只是相近段落、或只扫到页码没题干),ok=false,【绝不硬编】。` + langInstruction(user.lang),
    { type: "object", properties: { ok: { type: "boolean" }, qtype: { type: "string" }, stem: { type: "string" }, answer: { type: "string" }, explanation: { type: "string" } }, required: ["ok"] }
  );
  if (!out || !out.ok || !out.stem || String(out.stem).trim().length < 6) return { ok: false };
  return { ok: true, qtype: out.qtype || "short", stem: String(out.stem).trim(), answer: out.answer || "", explanation: out.explanation || "" };
}

// 判断一份资料是不是「指针清单」:很多行都是纯引用(页码/题号/章节),占比高。
export function looksLikePointerList(text) {
  const lines = String(text || "").split(/\r?\n|；|;/).map((x) => x.trim()).filter((x) => x.length >= 3);
  if (lines.length < 2) return false;
  let refLines = 0;
  for (const ln of lines) { const p = parseReference(ln); if ((p.pages.length || p.exercises.length || p.chapters.length) && ln.length < 90) refLines++; }
  return refLines >= 2 && refLines / lines.length >= 0.4;
}

// 多模态兜底:文本索引里没找到时,直接把原始的图片/扫描PDF发给 Gemini 让它在图里找这道题(扫描教材也能读,不用用户自己拍)。
async function readReferenceFromImages(exam, reference, user) {
  const examLang = exam.exam_lang || user.lang || "";
  const mats = db.prepare(`SELECT m.id, m.mime, m.kind, m.filename FROM materials m
    WHERE m.exam_id IN ${scopeSql(familyScope(exam.id))} AND m.status='ready' AND m.stored=1
    AND (m.kind='image' OR m.kind='pdf' OR m.mime LIKE 'image/%' OR m.mime='application/pdf') ORDER BY m.id`).all().slice(0, 4);
  for (const m of mats) {
    const buf = readMat(m.id); if (!buf) continue;
    let res; try {
      res = await generate(null, { contents: [{ role: "user", parts: [
        { inlineData: { mimeType: m.mime || (m.kind === "pdf" ? "application/pdf" : "image/jpeg"), data: buf.toString("base64") } },
        { text: `这是考生上传的教材(可能是扫描件/图片)。请在其中找到「${reference}」(如 教材第X页第Y题 / p.42 ex.3)对应的那一道题,把【正好对应它的那一道题】提取出来(只取这一道,别带相邻题/页码标记)。stem 用这门考试的语言(${examLang})表述(原文已是该语言就原样、否则翻译)。
只输出 JSON:{"ok":true/false,"qtype":"single|multi|judge|fill|short","stem":"题目原文","answer":"教材里若给了答案就填,否则留空"}。
找不到、或那处不是一道完整的题,ok=false。【绝不编造】。` + langInstruction(user.lang) }
      ] }] });
    } catch { continue; }
    let out = null; try { out = JSON.parse((res.text || "").replace(/^[^{]*/, "").replace(/[^}]*$/, "")); } catch {}
    if (out && out.ok && out.stem && String(out.stem).trim().length >= 6) {
      return { ok: true, qtype: out.qtype || "short", stem: String(out.stem).trim(), answer: out.answer || "", via: m.filename };
    }
  }
  return { ok: false };
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
    const q = await extractQuestion(user, exam, reference, loc);
    let stem = "", qtype = "short", answer = "", explanation = "";
    if (q.ok) { stem = q.stem; qtype = q.qtype; answer = q.answer || ""; explanation = q.explanation || ""; }
    else {
      // 文本没提炼出干净的单题 → 多模态兜底:直接读原始图片/扫描PDF(会输出该考试语言的单道题);还不行就算没找到(绝不塞原始杂片段)。
      const mm = await readReferenceFromImages(exam, reference, user);
      if (mm.ok) { stem = mm.stem; qtype = mm.qtype || "short"; answer = mm.answer || ""; explanation = ""; }
    }
    if (!stem || stem.length < 6) {
      misses.push({ label: r.label || "", reference, note: "教材里没定位到 / 那处不是完整题目" });
      continue;
    }
    let questionId = null;
    if (ingest) { try { questionId = bankAdd(exam.id, { qtype, stem, answer, explanation, must: !!markMust }); } catch {} }
    hits.push({ label: r.label || "", reference, questionId, stem: stem.slice(0, 90), status: loc.status });
  }
  return { total: refs.length, added: hits.filter((h) => h.questionId).length, hits, misses, needImages };
}

// 上传后自动解析:新传的若是指针清单→解析它;否则(可能是教材)→重解析本考试其它指针清单(它们之前的缺口现在可能能补上)。
// 结果写进首页横幅,用户【不用点任何按钮、也不用先看那份PDF】。
export async function autoResolveOnUpload(user, examId, uploadedMaterialId) {
  try {
    const exam = db.prepare("SELECT * FROM exams WHERE id=? AND user_id=? AND deleted_at IS NULL").get(Number(examId), user.id);
    if (!exam) return;
    const mats = db.prepare(`SELECT id, filename FROM materials WHERE exam_id IN ${scopeSql(familyScope(exam.id))} AND status='ready'`).all();
    const targets = [];
    let upText = ""; try { upText = materialText(exam.id, uploadedMaterialId); } catch {}
    if (looksLikePointerList(upText)) targets.push(uploadedMaterialId);
    else { for (const m of mats) { if (m.id === uploadedMaterialId) continue; let tx = ""; try { tx = materialText(exam.id, m.id); } catch {} if (looksLikePointerList(tx)) targets.push(m.id); } }
    if (!targets.length) return;
    let added = 0, misses = 0; const files = [];
    for (const mid of targets.slice(0, 3)) {
      const r = await resolveReferenceList(user, exam, { materialId: mid, ingest: true });
      added += r.added || 0; misses += (r.misses || []).length + (r.needImages || []).length;
      const nm = mats.find((x) => x.id === mid)?.filename; if (nm) files.push(nm);
    }
    if (added > 0 || misses > 0) {
      try { setSetting("resolve_banner:" + user.id, JSON.stringify({ examId: exam.id, examName: exam.name, added, misses, files: files.slice(0, 3), at: Date.now() })); } catch {}
    }
  } catch {}
}
export function getResolveBanner(userId) { try { const s = getSetting("resolve_banner:" + userId); return s ? JSON.parse(s) : null; } catch { return null; } }
export function clearResolveBanner(userId) { try { setSetting("resolve_banner:" + userId, ""); } catch {} }