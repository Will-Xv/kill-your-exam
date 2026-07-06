import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";

// 历史模拟考:无 id 时列表;有 id 时返回该次的完整作答回顾(永久保存)
export async function GET(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ mocks: [] });
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const m = db.prepare("SELECT * FROM mock_exams WHERE id=? AND exam_id=?").get(Number(id), exam.id);
    if (!m) return forbidden();
    const score = m.score_json ? JSON.parse(m.score_json) : null;
    const items = m.answers_json ? JSON.parse(m.answers_json) : [];
    return Response.json({ id: m.id, created_at: m.created_at, score, items });
  }
  const rows = db.prepare("SELECT id, score_json, created_at FROM mock_exams WHERE exam_id=? AND score_json IS NOT NULL ORDER BY id DESC LIMIT 100").all(exam.id);
  return Response.json({
    mocks: rows.map((r) => { const s = r.score_json ? JSON.parse(r.score_json) : null; return { id: r.id, created_at: r.created_at, pct: s?.pct ?? null, got: s?.got ?? 0, total: s?.total ?? 0 }; })
  });
}
