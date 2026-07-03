import db from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

// 管理员专用:只返回使用频率统计,不含任何学习内容
export async function GET() {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  if (!me.is_admin) return forbidden();
  const users = db.prepare("SELECT id, username, is_admin, created_at FROM users ORDER BY id").all();
  const rows = users.map((u) => {
    const a = db.prepare(`SELECT COUNT(*) total, COUNT(DISTINCT date(a.created_at,'localtime')) days, MAX(a.created_at) last
      FROM attempts a JOIN exams e ON e.id=a.exam_id WHERE e.user_id=? AND a.mode!='resolved'`).get(u.id);
    const c = db.prepare(`SELECT COUNT(*) total, MAX(m.created_at) last
      FROM chat_messages m JOIN exams e ON e.id=m.exam_id WHERE e.user_id=? AND m.role='user'`).get(u.id);
    const week = db.prepare(`SELECT date(a.created_at,'localtime') d, COUNT(*) n
      FROM attempts a JOIN exams e ON e.id=a.exam_id
      WHERE e.user_id=? AND a.mode!='resolved' AND a.created_at > datetime('now','-7 days')
      GROUP BY d ORDER BY d`).all(u.id);
    const last = [a.last, c.last].filter(Boolean).sort().pop() || null;
    return {
      id: u.id, username: u.username, isAdmin: !!u.is_admin, createdAt: u.created_at,
      attempts: a.total, activeDays: a.days, chats: c.total, lastActive: last, week
    };
  });
  return Response.json({ users: rows });
}
