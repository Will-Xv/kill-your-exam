import db from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { masteryMatrix, dueReviewCount } from "@/lib/mastery";

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ plan: null });
  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD 本地
  let plan = db.prepare("SELECT * FROM daily_plans WHERE exam_id=? AND date=?").get(exam.id, today);
  if (!plan) {
    // 生成今日计划:优先薄弱/未学知识点(有资料覆盖的优先)
    const matrix = masteryMatrix(exam.id);
    const rank = { weak: 0, unlearned: 1, ok: 2, mastered: 3 };
    const cover = { covered: 0, partial: 1, none: 2 };
    const picks = matrix
      .sort((a, b) => rank[a.level] - rank[b.level] || cover[a.coverage] - cover[b.coverage] || a.attempts - b.attempts)
      .slice(0, 2)
      .map((k) => ({ type: "kp", kpId: k.id, title: k.title, chapter: k.chapter }));
    const items = [{ type: "review" }, ...picks, { type: "free", target: 10 }];
    db.prepare("INSERT INTO daily_plans(exam_id,date,items_json,completed) VALUES(?,?,?,0)").run(exam.id, today, JSON.stringify(items));
    plan = db.prepare("SELECT * FROM daily_plans WHERE exam_id=? AND date=?").get(exam.id, today);
  }
  const items = JSON.parse(plan.items_json);
  // done 状态由真实数据动态计算,不依赖打卡
  const due = dueReviewCount(exam.id);
  const todayAttempts = db.prepare(`SELECT COUNT(*) n FROM attempts WHERE exam_id=? AND mode!='resolved' AND date(created_at,'localtime')=date('now','localtime')`).get(exam.id).n;
  const enriched = items.map((it) => {
    if (it.type === "review") return { ...it, due, done: due === 0 };
    if (it.type === "kp") {
      const n = db.prepare(`SELECT COUNT(*) n FROM attempts WHERE kp_id=? AND date(created_at,'localtime')=date('now','localtime')`).get(it.kpId).n;
      return { ...it, done: n > 0 };
    }
    if (it.type === "free") return { ...it, count: todayAttempts, done: todayAttempts >= it.target };
    return it;
  });
  const streak = db.prepare(`SELECT COUNT(DISTINCT date(created_at,'localtime')) n FROM attempts WHERE exam_id=? AND mode!='resolved'`).get(exam.id).n;
  return Response.json({ plan: { date: today, items: enriched }, activeDays: streak });
}
