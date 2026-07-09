import db, { examScope, scopeSql } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { dueReviewCount } from "@/lib/mastery";
export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ questions: [], due: 0 });
  const qs = db.prepare(`SELECT q.* FROM review_queue rq JOIN questions q ON q.id=rq.question_id
    WHERE q.exam_id IN ${scopeSql(examScope(exam.id))} AND q.flagged=0 AND rq.due_date <= date('now','localtime') ORDER BY rq.due_date LIMIT 10`).all();
  return Response.json({
    due: dueReviewCount(exam.id),
    questions: qs.map((q) => ({ id: q.id, kp_id: q.kp_id, qtype: q.qtype, body: JSON.parse(q.body), difficulty: q.difficulty, source_type: q.source_type, source_refs: q.source_refs }))
  });
}
