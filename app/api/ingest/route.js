import db from "@/lib/db";
import { indexMaterial } from "@/lib/rag";
import { getActiveExam } from "@/lib/db";
import { aiErrorResponse } from "@/lib/errors";

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

  const { title, url, text } = await req.json();
  if (!text || text.trim().length < 50) return Response.json({ error: "页面正文太少,没有采集到有效内容" }, { status: 400, headers: corsHeaders() });
  const name = (title || url || "网页采集").slice(0, 120);
  const ins = db.prepare("INSERT INTO materials(exam_id,filename,source_url,kind,status) VALUES(?,?,?,?,?)")
    .run(exam.id, name, url || null, "web", "processing");
  try {
    const n = await indexMaterial(ins.lastInsertRowid, exam.id, text, name);
    db.prepare("UPDATE materials SET status='ready' WHERE id=?").run(ins.lastInsertRowid);
    return Response.json({ ok: true, chunks: n, exam: exam.name }, { headers: corsHeaders() });
  } catch (e) {
    db.prepare("UPDATE materials SET status='failed', error=? WHERE id=?").run(String(e?.message || e).slice(0, 200), ins.lastInsertRowid);
    const r = aiErrorResponse(e);
    return new Response(r.body, { status: r.status, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
  }
}
