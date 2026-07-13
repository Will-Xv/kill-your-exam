// 联网搜索的资料也要多模态:抓取来源网页里的示意图/图表,存成图片资料(会被 OCR/描述并作为多模态附件)。
// 带守卫:只 http(s)、只 image/*、跳过太小的图标/太大的文件、限量,并做基本的 logo/icon/广告过滤。
import db from "@/lib/db";
import { saveMat } from "@/lib/files";
import { parseUpload } from "@/lib/parse";
import { indexMaterial } from "@/lib/rag";

const BAD = /(logo|icon|sprite|avatar|favicon|banner|ad[-_/]|advert|pixel|tracking|button|badge|thumb\b|emoji|spacer|1x1)/i;

function absUrl(u, base) {
  if (!u) return null;
  if (u.startsWith("//")) return "https:" + u;
  if (/^https?:\/\//i.test(u)) return u;
  try { return new URL(u, base).href; } catch { return null; }
}

export async function ingestWebImages(examId, sources, topic, { maxPages = 2, maxImages = 3 } = {}) {
  const cand = [];
  for (const src of (sources || []).slice(0, maxPages)) {
    if (!src?.url || !/^https?:\/\//i.test(src.url)) continue;
    let html = "";
    try { const r = await fetch(src.url, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "Mozilla/5.0" } }); if (r.ok) html = await r.text(); } catch {}
    if (!html) continue;
    for (const m of html.matchAll(/<img[^>]+?src=["']([^"']+)["'][^>]*>/gi)) {
      const tag = m[0]; const u = absUrl(m[1], src.url);
      if (!u || BAD.test(u) || BAD.test(tag)) continue;
      if (/\.(svg|gif)(\?|$)/i.test(u)) continue; // 矢量/动图跳过
      // 优先带 width 提示较大的图
      const wM = tag.match(/width=["']?(\d+)/i); const w = wM ? parseInt(wM[1], 10) : 0;
      cand.push({ u, w });
    }
    if (cand.length >= 30) break;
  }
  // 去重 + 宽度大的优先
  const seen = new Set(); const uniq = [];
  cand.sort((a, b) => b.w - a.w);
  for (const c of cand) { if (seen.has(c.u)) continue; seen.add(c.u); uniq.push(c.u); }

  let added = 0;
  for (const u of uniq) {
    if (added >= maxImages) break;
    try {
      const resp = await fetch(u, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "Mozilla/5.0" } });
      if (!resp.ok) continue;
      const ct = (resp.headers.get("content-type") || "").split(";")[0].trim();
      if (!ct.startsWith("image/") || /svg/i.test(ct)) continue;
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length < 8000 || buf.length > 5 * 1024 * 1024) continue; // 跳过小图标/超大文件
      const rec = db.prepare("INSERT INTO materials(exam_id,filename,source_url,kind,status,mime,stored) VALUES(?,?,?,?,?,?,0)")
        .run(examId, (topic + " · 网图").slice(0, 80), u, "image", "processing", ct);
      saveMat(rec.lastInsertRowid, buf);
      db.prepare("UPDATE materials SET stored=1 WHERE id=?").run(rec.lastInsertRowid);
      try { const { text } = await parseUpload("web-image", buf, ct); if (text && text.trim().length >= 20) await indexMaterial(rec.lastInsertRowid, examId, text, topic + " · 网图"); } catch {}
      db.prepare("UPDATE materials SET status='ready' WHERE id=?").run(rec.lastInsertRowid);
      added++;
    } catch {}
  }
  return added;
}
