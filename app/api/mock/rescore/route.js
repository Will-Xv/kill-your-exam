import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";

const DEFAULT_MARKS = { single: 2, multi: 3, judge: 1, fill: 3, short: 10, perform: 20 };

// 争论改判后重算某场模拟考的成绩(权威地从 attempts 现值重算,反映 finalize 的改动),并回写 mock_exams。
export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const { mockId } = await req.json().catch(() => ({}));
  const mock = db.prepare("SELECT * FROM mock_exams WHERE id=?").get(mockId);
  if (!mock || !exam || mock.exam_id !== exam.id) return forbidden();
  const cfg = (() => { try { return JSON.parse(mock.config_json); } catch { return {}; } })();
  const marksMap = cfg.marks || {};
  const answersOut = (() => { try { return JSON.parse(mock.answers_json || "[]"); } catch { return []; } })();

  let total = 0, got = 0, totalMarks = 0, gotMarks = 0;
  const byChapter = {};
  const results = [];
  for (const a of answersOut) {
    const at = a.attemptId ? db.prepare("SELECT * FROM attempts WHERE id=?").get(a.attemptId) : null;
    const correct = at ? (at.correct ? 1 : 0) : (a.correct ? 1 : 0);
    const scoreVal = at && at.score != null ? at.score : (correct ? 100 : 0);
    const qMarks = marksMap[a.qid] != null ? marksMap[a.qid] : (DEFAULT_MARKS[a.qtype] ?? 2);
    const earned = Math.round(qMarks * (scoreVal / 100) * 10) / 10;
    let ch = a.chapter;
    if (!ch) {
      const q = db.prepare("SELECT kp_id FROM questions WHERE id=?").get(a.qid);
      ch = q?.kp_id ? (db.prepare("SELECT ch.title FROM knowledge_points kp LEFT JOIN knowledge_points ch ON ch.id=kp.parent_id WHERE kp.id=?").get(q.kp_id)?.title || "其他") : "其他";
    }
    total++; got += correct; totalMarks += qMarks; gotMarks += earned;
    byChapter[ch] = byChapter[ch] || { total: 0, got: 0, totalMarks: 0, gotMarks: 0 };
    byChapter[ch].total++; byChapter[ch].got += correct; byChapter[ch].totalMarks += qMarks; byChapter[ch].gotMarks += earned;
    a.correct = correct; a.score = scoreVal; a.marks = qMarks; a.earned = earned; a.chapter = ch;
    results.push({ id: a.qid, qtype: a.qtype, correct, score: scoreVal, marks: qMarks, earned, chapter: ch, answer: a.answer, explanation: a.explanation || "", attemptId: a.attemptId });
  }
  const score = { total, got, totalMarks: Math.round(totalMarks * 10) / 10, gotMarks: Math.round(gotMarks * 10) / 10, pct: totalMarks ? Math.round((gotMarks / totalMarks) * 100) : (total ? Math.round((got / total) * 100) : 0), byChapter };
  db.prepare("UPDATE mock_exams SET score_json=?, answers_json=? WHERE id=?").run(JSON.stringify(score), JSON.stringify(answersOut), mockId);
  return Response.json({ score, results });
}
