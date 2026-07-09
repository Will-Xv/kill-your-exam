import db, { examScope } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ tree: [] });
  const scope = examScope(exam.id);
  const agg = scope.length > 1;                 // 开了汇总复习且有子考试
  const chapters = [];
  for (const exId of scope) {
    const exName = agg ? (db.prepare("SELECT name FROM exams WHERE id=?").get(exId)?.name || "") : "";
    const rows = db.prepare("SELECT * FROM knowledge_points WHERE exam_id=? ORDER BY sort").all(exId);
    for (const ch of rows.filter((r) => !r.parent_id)) {
      chapters.push({
        ...ch,
        fromExamId: exId,
        fromExamName: exName,
        isSub: exId !== exam.id,                // 来自子考试(非当前母考试自身)
        points: rows.filter((r) => r.parent_id === ch.id).map((p) => {
          const stat = db.prepare("SELECT COUNT(*) n, SUM(correct) c FROM attempts WHERE kp_id=?").get(p.id);
          return { ...p, attempts: stat.n || 0, correct: stat.c || 0 };
        })
      });
    }
  }
  return Response.json({ tree: chapters, aggregating: agg });
}
