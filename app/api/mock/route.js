import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";

// 组一套模拟卷:优先复用已有题,按题型均衡抽取
export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ error: "no exam" }, { status: 400 });
  const { count = 20 } = await req.json().catch(() => ({}));
  const pool = db.prepare(`SELECT * FROM questions WHERE exam_id=? AND flagged=0 ORDER BY RANDOM() LIMIT ?`).all(exam.id, count * 3);
  if (pool.length < 5) return Response.json({ error: "题库太少,请先在练习页多生成一些题,再来模拟考。" }, { status: 400 });
  // 按题型分组均衡抽取
  const byType = {};
  for (const q of pool) (byType[q.qtype] ||= []).push(q);
  const picked = [];
  const types = Object.keys(byType);
  let i = 0;
  while (picked.length < Math.min(count, pool.length) && types.some((tp) => byType[tp].length)) {
    const tp = types[i % types.length];
    if (byType[tp].length) picked.push(byType[tp].shift());
    i++;
  }
  const info = db.prepare("INSERT INTO mock_exams(exam_id,config_json) VALUES(?,?)")
    .run(exam.id, JSON.stringify({ questionIds: picked.map((q) => q.id), createdAt: Date.now() }));
  return Response.json({
    mockId: info.lastInsertRowid,
    questions: picked.map((q) => ({ id: q.id, kp_id: q.kp_id, qtype: q.qtype, body: JSON.parse(q.body) }))
  });
}
