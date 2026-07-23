import db, { purgeExpiredUsers } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/auth";

// 管理员专用:只返回使用频率统计,不含任何学习内容
export async function GET() {
  const me = await getSessionUser();
  if (!me) return unauthorized();
  if (!me.is_admin) return forbidden();
  purgeExpiredUsers();
  const users = db.prepare("SELECT id, username, is_admin, is_developer, created_at, deleted_at FROM users ORDER BY id").all();
  const rows = users.map((u) => {
    const a = db.prepare(`SELECT COUNT(*) total, COUNT(DISTINCT date(a.created_at,'localtime')) days, MAX(a.created_at) last
      FROM attempts a JOIN exams e ON e.id=a.exam_id WHERE e.user_id=? AND a.mode!='resolved'`).get(u.id);
    // 【统一聊天:消息存在 exam_id = -用户id(负数),不属于任何 exams 行】
    // 以前这里 JOIN exams ON e.id=m.exam_id → 负数永远匹配不上真实 exam.id → 所有人聊天数都成 0。
    // 按统一聊天 key(-u.id)数,并兼容早期可能落在真实 exam_id 下的老消息。
    const c = db.prepare(`SELECT COUNT(*) total, MAX(created_at) last FROM chat_messages
      WHERE role='user' AND (exam_id = ? OR exam_id IN (SELECT id FROM exams WHERE user_id=?))`).get(-u.id, u.id);
    const week = db.prepare(`SELECT date(a.created_at,'localtime') d, COUNT(*) n
      FROM attempts a JOIN exams e ON e.id=a.exam_id
      WHERE e.user_id=? AND a.mode!='resolved' AND a.created_at > datetime('now','-7 days')
      GROUP BY d ORDER BY d`).all(u.id);
    const last = [a.last, c.last].filter(Boolean).sort().pop() || null;
    return {
      id: u.id, username: u.username, isAdmin: !!u.is_admin, isDeveloper: !!u.is_developer, createdAt: u.created_at, deletedAt: u.deleted_at,
      attempts: a.total, activeDays: a.days, chats: c.total, lastActive: last, week
    };
  });
  return Response.json({ users: rows });
}
