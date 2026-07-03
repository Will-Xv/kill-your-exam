import db from "./db";
import { embed, cosine } from "./gemini";

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
      JOIN materials m ON m.id = c.material_id WHERE c.exam_id=? AND m.status='ready'`)
    .all(examId);
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
