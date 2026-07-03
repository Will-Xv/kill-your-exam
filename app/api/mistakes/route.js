import db, { getActiveExam } from "@/lib/db";
export async function GET() {
  const exam = getActiveExam();
  if (!exam) return Response.json({ mistakes: [] });
  const rows = db.prepare(`SELECT q.id, q.qtype, q.body, q.answer, q.kp_id, kp.title kp_title,
      a.user_answer, a.created_at last_at,
      (SELECT due_date FROM review_queue WHERE question_id=q.id) due_date
    FROM questions q
    LEFT JOIN knowledge_points kp ON kp.id=q.kp_id
    JOIN attempts a ON a.id = (SELECT id FROM attempts WHERE question_id=q.id ORDER BY id DESC LIMIT 1)
    WHERE q.exam_id=? AND q.flagged=0 AND a.correct=0 ORDER BY a.created_at DESC LIMIT 200`).all(exam.id);
  return Response.json({
    mistakes: rows.map((r) => ({ ...r, body: JSON.parse(r.body), answer: JSON.parse(r.answer) }))
  });
}
export async function DELETE(req) {
  // “我已理解,移出错题本”
  const { questionId } = await req.json();
  const q = db.prepare("SELECT * FROM questions WHERE id=?").get(questionId);
  if (q) {
    db.prepare("DELETE FROM review_queue WHERE question_id=?").run(questionId);
    db.prepare("INSERT INTO attempts(question_id,exam_id,kp_id,user_answer,correct,score,mode) VALUES(?,?,?,?,1,100,'resolved')")
      .run(questionId, q.exam_id, q.kp_id, "(手动移出错题本)");
  }
  return Response.json({ ok: true });
}
