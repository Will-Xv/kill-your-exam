import db from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";
export async function POST(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { fromExamId, toExamId } = await req.json();
  const from = db.prepare("SELECT * FROM exams WHERE id=?").get(fromExamId);
  const to = db.prepare("SELECT * FROM exams WHERE id=?").get(toExamId);
  if (!from || !to || from.user_id !== u.id || to.user_id !== u.id) return forbidden();
  const mats = db.prepare("SELECT * FROM materials WHERE exam_id=? AND status='ready'").all(fromExamId);
  const tx = db.transaction(() => {
    for (const m of mats) {
      const ni = db.prepare("INSERT INTO materials(exam_id,filename,source_url,kind,status) VALUES(?,?,?,?,'ready')")
        .run(toExamId, "[借用] " + m.filename, m.source_url, m.kind);
      const chunks = db.prepare("SELECT content, heading_path, embedding FROM chunks WHERE material_id=?").all(m.id);
      const ins = db.prepare("INSERT INTO chunks(material_id,exam_id,content,heading_path,embedding) VALUES(?,?,?,?,?)");
      for (const c of chunks) ins.run(ni.lastInsertRowid, toExamId, c.content, c.heading_path, c.embedding);
    }
  });
  tx();
  return Response.json({ ok: true, borrowed: mats.length });
}
