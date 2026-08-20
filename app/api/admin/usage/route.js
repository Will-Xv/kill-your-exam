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
    // 【Token 用量】总量 + 近7天 + 按模型拆分。thoughts=思考token(不含在 output 里,单独计费)。
    const tk = db.prepare(`SELECT COALESCE(SUM(calls),0) calls, COALESCE(SUM(prompt),0) prompt, COALESCE(SUM(cached),0) cached,
      COALESCE(SUM(thoughts),0) thoughts, COALESCE(SUM(output),0) output, COALESCE(SUM(tool_use),0) toolUse, COALESCE(SUM(total),0) total
      FROM token_usage WHERE user_id=?`).get(u.id);
    const tk7 = db.prepare(`SELECT COALESCE(SUM(total),0) total, COALESCE(SUM(thoughts),0) thoughts
      FROM token_usage WHERE user_id=? AND day > date('now','-7 days')`).get(u.id);
    // 近 30 天按天(只列有消耗的天;前端补齐空白天)
    const days30 = db.prepare(`SELECT day d, SUM(total) total, SUM(thoughts) thoughts, SUM(cached) cached, SUM(calls) calls
      FROM token_usage WHERE user_id=? AND day > date('now','-30 days') GROUP BY day ORDER BY day`).all(u.id);
    const byModel = db.prepare(`SELECT model, SUM(calls) calls, SUM(total) total, SUM(thoughts) thoughts
      FROM token_usage WHERE user_id=? GROUP BY model ORDER BY total DESC`).all(u.id);
    const last = [a.last, c.last].filter(Boolean).sort().pop() || null;
    return {
      id: u.id, username: u.username, isAdmin: !!u.is_admin, isDeveloper: !!u.is_developer, createdAt: u.created_at, deletedAt: u.deleted_at,
      attempts: a.total, activeDays: a.days, chats: c.total, lastActive: last, week,
      tokens: { ...tk, total7: tk7.total, thoughts7: tk7.thoughts, byModel, days30 }
    };
  });
  // 后台/系统调用(入库、判题、cron 等拿不到请求用户)单列一行,不摊到任何人头上
  const sys = db.prepare(`SELECT COALESCE(SUM(calls),0) calls, COALESCE(SUM(prompt),0) prompt, COALESCE(SUM(cached),0) cached,
    COALESCE(SUM(thoughts),0) thoughts, COALESCE(SUM(output),0) output, COALESCE(SUM(tool_use),0) toolUse, COALESCE(SUM(total),0) total
    FROM token_usage WHERE user_id=0`).get();
  const all = db.prepare(`SELECT COALESCE(SUM(total),0) total, COALESCE(SUM(thoughts),0) thoughts, COALESCE(SUM(cached),0) cached, COALESCE(SUM(calls),0) calls FROM token_usage`).get();
  return Response.json({ users: rows, tokenSystem: sys, tokenAll: all });
}
