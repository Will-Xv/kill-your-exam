import db from "@/lib/db";
import { indexMaterial, afterMaterialsChanged } from "@/lib/rag";
import { getActiveExam } from "@/lib/db";
import { aiErrorResponse } from "@/lib/errors";
import { parseUpload } from "@/lib/parse";
import { saveMat, guessMime, kindOf } from "@/lib/files";

export const maxDuration = 300;

function corsHeaders() {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Ingest-Token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
}
export async function OPTIONS() { return new Response(null, { headers: corsHeaders() }); }

export async function POST(req) {
  const token = req.headers.get("X-Ingest-Token") || "";
  const row = db.prepare("SELECT user_id FROM ingest_tokens WHERE token=?").get(token);
  if (!row) return Response.json({ error: "invalid token" }, { status: 401, headers: corsHeaders() });
  const user = db.prepare("SELECT * FROM users WHERE id=? AND deleted_at IS NULL").get(row.user_id);
  if (!user) return Response.json({ error: "invalid user" }, { status: 401, headers: corsHeaders() });
  const exam = getActiveExam(user.id);
  if (!exam) return Response.json({ error: "没有激活的考试,请先在网站里创建/选择一个考试" }, { status: 400, headers: corsHeaders() });

  const { title, url, text, mediaUrls } = await req.json();
  const name = (title || url || "网页采集").slice(0, 120);
  const hasText = text && text.trim().length >= 50;
  const media = Array.isArray(mediaUrls) ? mediaUrls.filter((u) => /^https?:/i.test(u)).slice(0, 12) : [];
  if (!hasText && !media.length) return Response.json({ error: "页面正文太少,也没抓到图片/音频" }, { status: 400, headers: corsHeaders() });

  let chunks = 0, saved = 0;
  try {
    // 1) 正文文本入库
    if (hasText) {
      const ins = db.prepare("INSERT INTO materials(exam_id,filename,source_url,kind,status,mime,stored) VALUES(?,?,?,?,?,?,0)")
        .run(exam.id, name, url || null, "web", "processing", "text/plain");
      try { chunks = await indexMaterial(ins.lastInsertRowid, exam.id, text, name); db.prepare("UPDATE materials SET status='ready' WHERE id=?").run(ins.lastInsertRowid); }
      catch (e) { db.prepare("UPDATE materials SET status='failed', error=? WHERE id=?").run(String(e?.message || e).slice(0, 200), ins.lastInsertRowid); throw e; }
    }
    // 2) 网页里的图片/音频/PDF —— 服务端抓取原文件保存(供查看 + Gemini 多模态)
    let total = 0;
    for (const mu of media) {
      try {
        const resp = await fetch(mu, { redirect: "follow" });
        if (!resp.ok) continue;
        const ct = (resp.headers.get("content-type") || "").split(";")[0].trim();
        if (!/^(image\/|audio\/|application\/pdf)/.test(ct)) continue;
        const buf = Buffer.from(await resp.arrayBuffer());
        if (!buf.length || buf.length > 25 * 1024 * 1024) continue;
        total += buf.length; if (total > 60 * 1024 * 1024) break;
        const fname = decodeURIComponent((mu.split("?")[0].split("/").pop() || "web-media")).slice(0, 120) || "web-media";
        const mime = ct || guessMime(fname);
        const kind = kindOf(fname, mime);
        const rec = db.prepare("INSERT INTO materials(exam_id,filename,source_url,kind,status,mime,stored) VALUES(?,?,?,?,?,?,1)")
          .run(exam.id, fname, mu, kind, "ready", mime);
        saveMat(rec.lastInsertRowid, buf);
        if (kind === "image") { try { const { text: ot } = await parseUpload(fname, buf, mime); if (ot && ot.trim().length >= 30) await indexMaterial(rec.lastInsertRowid, exam.id, ot, fname); } catch {} }
        saved++;
      } catch {}
    }
    await afterMaterialsChanged(exam.id); // 重算覆盖度 + 刷新今日计划
    return Response.json({ ok: true, chunks, media: saved, exam: exam.name }, { headers: corsHeaders() });
  } catch (e) {
    const r = aiErrorResponse(e);
    return new Response(r.body, { status: r.status, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
  }
}
