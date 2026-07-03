import db from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/auth";
import { embed, cosine } from "@/lib/gemini";

// 新建考试时:找出旧考试中与新考试名相关、可借用的资料
export async function POST(req) {
  const u = await getSessionUser();
  if (!u) return unauthorized();
  const { examName, targetExamId } = await req.json();
  const others = db.prepare(`SELECT DISTINCT e.id, e.name FROM exams e JOIN materials m ON m.exam_id=e.id
    WHERE e.user_id=? AND e.id!=? AND m.status='ready'`).all(u.id, targetExamId || 0);
  if (!others.length) return Response.json({ related: [] });
  const [qv] = await embed([examName]);
  const scored = [];
  for (const o of others) {
    const [ov] = await embed([o.name]);
    const matCount = db.prepare("SELECT COUNT(*) n FROM materials WHERE exam_id=? AND status='ready'").get(o.id).n;
    scored.push({ id: o.id, name: o.name, materials: matCount, score: cosine(qv, ov) });
  }
  return Response.json({ related: scored.filter((s) => s.score > 0.45).sort((a, b) => b.score - a.score) });
}
