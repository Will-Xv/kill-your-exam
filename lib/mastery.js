import db from "./db";

export const LEVELS = { unlearned: "未学", weak: "薄弱", ok: "一般", mastered: "掌握" };
const INTERVALS = [1, 3, 7, 15, 30]; // 间隔重复天数

// 每个叶子知识点的掌握度(规则计算,近期作答权重更高)
export function masteryMatrix(examId) {
  const kps = db.prepare(`SELECT kp.*, ch.title chapter FROM knowledge_points kp
    LEFT JOIN knowledge_points ch ON ch.id = kp.parent_id
    WHERE kp.exam_id=? AND kp.parent_id IS NOT NULL ORDER BY ch.sort, kp.sort`).all(examId);
  const rows = db.prepare(`SELECT kp_id, correct, created_at FROM attempts
    WHERE exam_id=? AND mode != 'resolved' AND kp_id IS NOT NULL`).all(examId);
  const byKp = {};
  for (const r of rows) (byKp[r.kp_id] ||= []).push(r);
  return kps.map((kp) => {
    const arr = byKp[kp.id] || [];
    let wSum = 0, wCorrect = 0;
    for (const a of arr) {
      const days = (Date.now() - new Date(a.created_at + "Z").getTime()) / 86400000;
      const w = Math.exp(-Math.max(0, days) / 14);
      wSum += w; wCorrect += w * (a.correct ? 1 : 0);
    }
    const acc = wSum ? wCorrect / wSum : 0;
    let level = "unlearned";
    if (arr.length > 0) level = acc < 0.6 ? "weak" : acc < 0.85 || arr.length < 3 ? "ok" : "mastered";
    return { ...kp, attempts: arr.length, accuracy: Math.round(acc * 100), level };
  });
}

// 答题后维护间隔重复队列
export function updateReviewQueue(questionId, correct) {
  const row = db.prepare("SELECT * FROM review_queue WHERE question_id=?").get(questionId);
  if (!correct) {
    if (row) db.prepare("UPDATE review_queue SET interval_level=0, due_date=date('now','localtime','+1 day') WHERE id=?").run(row.id);
    else db.prepare("INSERT INTO review_queue(question_id, due_date, interval_level) VALUES(?, date('now','localtime','+1 day'), 0)").run(questionId);
    return;
  }
  if (!row) return;
  const lvl = row.interval_level + 1;
  if (lvl >= INTERVALS.length) db.prepare("DELETE FROM review_queue WHERE id=?").run(row.id);
  else db.prepare(`UPDATE review_queue SET interval_level=?, due_date=date('now','localtime','+${INTERVALS[lvl]} day') WHERE id=?`).run(lvl, row.id);
}

export function dueReviewCount(examId) {
  return db.prepare(`SELECT COUNT(*) n FROM review_queue rq JOIN questions q ON q.id=rq.question_id
    WHERE q.exam_id=? AND q.flagged=0 AND rq.due_date <= date('now','localtime')`).get(examId).n;
}
