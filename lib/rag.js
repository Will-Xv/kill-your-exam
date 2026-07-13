import { familyScope, scopeSql } from "@/lib/db";
import db from "./db";
import { embed, cosine, uploadMedia } from "./gemini";
import { readMat } from "./files";

// 按段落分块,目标 800~1200 字
export function chunkText(text, headingHint = "") {
  const paras = text.split(/\n{2,}|\r\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = "";
  let heading = headingHint;
  for (const p of paras) {
    if (/^(第[一二三四五六七八九十百\d]+[章节篇部]|[#]{1,3}\s|\d+(\.\d+)*\s)/.test(p) && p.length < 60) heading = p.replace(/^#+\s*/, "");
    if ((cur + p).length > 1100 && cur) {
      chunks.push({ content: cur.trim(), heading });
      cur = "";
    }
    cur += p + "\n";
    if (cur.length > 1100) {
      chunks.push({ content: cur.trim(), heading });
      cur = "";
    }
  }
  if (cur.trim().length > 30) chunks.push({ content: cur.trim(), heading });
  return chunks;
}

export async function indexMaterial(materialId, examId, text, headingHint = "") {
  const chunks = chunkText(text, headingHint);
  if (!chunks.length) return 0;
  // 分批 embedding,每批最多 90
  for (let i = 0; i < chunks.length; i += 90) {
    const batch = chunks.slice(i, i + 90);
    const vecs = await embed(batch.map((c) => c.content.slice(0, 6000)));
    const ins = db.prepare("INSERT INTO chunks(material_id,exam_id,content,heading_path,embedding) VALUES(?,?,?,?,?)");
    const tx = db.transaction(() => {
      batch.forEach((c, j) => ins.run(materialId, examId, c.content, c.heading || "", Buffer.from(vecs[j].buffer)));
    });
    tx();
  }
  return chunks.length;
}

// 检索:返回 [{id, content, heading_path, filename, score}]
export async function retrieve(examId, query, k = 6) {
  const rows = db
    .prepare(`SELECT c.id, c.content, c.heading_path, c.embedding, m.filename FROM chunks c
      JOIN materials m ON m.id = c.material_id WHERE c.exam_id IN ${scopeSql(familyScope(examId))} AND m.status='ready'`)
    .all();
  if (!rows.length) return [];
  const [qv] = await embed([query]);
  const scored = rows
    .map((r) => {
      const v = new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4);
      return { id: r.id, content: r.content, heading_path: r.heading_path, filename: r.filename, score: cosine(qv, v) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .filter((r) => r.score > 0.35);
  return scored;
}

export function ragBlock(hits) {
  if (!hits.length) return "";
  return hits
    .map((h, i) => `【资料${i + 1} | 来源:${h.filename}${h.heading_path ? " · " + h.heading_path : ""} | chunk_id:${h.id}】\n${h.content}`)
    .join("\n\n");
}


// 一份资料 → Gemini File API 的 fileData part(缓存 fileUri ~48h,避免每次重复上传)。见 CLAUDE.md:文件一律走 File API。
const _mimeOf = (m) => m.mime || (m.kind === "pdf" ? "application/pdf" : m.kind === "audio" ? "audio/mpeg" : "image/jpeg");
export async function materialFilePart(m) {
  const mime = _mimeOf(m);
  try {
    const row = db.prepare("SELECT gemini_uri, gemini_expiry FROM materials WHERE id=?").get(m.id);
    if (row && row.gemini_uri && row.gemini_expiry && new Date(row.gemini_expiry).getTime() > Date.now() + 10 * 60000) {
      return { fileData: { fileUri: row.gemini_uri, mimeType: mime } };
    }
    const buf = readMat(m.id); if (!buf) return null;
    const ext = /pdf/i.test(mime) ? "pdf" : /png/i.test(mime) ? "png" : /audio|mpeg/i.test(mime) ? "mp3" : "jpg";
    const up = await uploadMedia(buf, mime, ext);
    const expiry = new Date(Date.now() + 47 * 3600 * 1000).toISOString();
    try { db.prepare("UPDATE materials SET gemini_uri=?, gemini_name=?, gemini_expiry=? WHERE id=?").run(up.fileUri, up.name, expiry, m.id); } catch {}
    return { fileData: { fileUri: up.fileUri, mimeType: up.mimeType } };
  } catch { return null; }
}

// 取该考试已存原始文件的多模态 parts(图片/音频/PDF),通过 File API 引用(不再 inline base64)。
export async function materialParts(examId, { kinds = ["image", "audio", "pdf"], max = 6 } = {}) {
  let rows = [];
  try { rows = db.prepare(`SELECT id, mime, kind FROM materials WHERE exam_id IN ${scopeSql(familyScope(examId))} AND status='ready' AND stored=1 AND COALESCE(auto,0)=0 ORDER BY id DESC`).all(); } catch { return []; }
  const out = [];
  for (const r of rows) {
    if (!kinds.includes(r.kind)) continue;
    const p = await materialFilePart(r);
    if (p) out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

// 便捷:把该考试的原始图片/音频/PDF 作为多模态附件拼进一次生成调用
export async function mmOpts(examId, prompt, extraParts = []) {
  const parts = [...(await materialParts(examId)), ...(extraParts || [])];
  return parts.length ? { contents: [{ role: "user", parts: [{ text: prompt }, ...parts] }] } : {};
}

// 资料变动后:重算知识点资料覆盖度 + 让今天的学习计划失效(下次自动重生成)
export async function recomputeCoverage(examId) {
  const kps = db.prepare("SELECT id, title FROM knowledge_points WHERE exam_id=? AND parent_id IS NOT NULL").all(examId);
  if (!kps.length) return;
  const chunkRows = db.prepare(`SELECT embedding FROM chunks WHERE exam_id IN ${scopeSql(familyScope(examId))}`).all();
  const upd = db.prepare("UPDATE knowledge_points SET coverage=? WHERE id=?");
  if (!chunkRows.length) { kps.forEach((k) => upd.run("none", k.id)); return; }
  const chunkVecs = chunkRows.map((r) => new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4));
  const vecs = await embed(kps.map((k) => k.title));
  kps.forEach((k, i) => {
    let best = 0; const v = vecs[i]; if (v) for (const cv of chunkVecs) best = Math.max(best, cosine(v, cv));
    upd.run(best > 0.62 ? "covered" : best > 0.5 ? "partial" : "none", k.id);
  });
}
export function invalidateDailyPlan(examId) {
  const today = new Date().toLocaleDateString("sv-SE");
  try { db.prepare("DELETE FROM daily_plans WHERE exam_id=? AND date=?").run(examId, today); } catch {}
}
export async function afterMaterialsChanged(examId) {
  try { await recomputeCoverage(examId); } catch {}
  invalidateDailyPlan(examId);
}
