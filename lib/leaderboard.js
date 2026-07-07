import db from "@/lib/db";

const fmt = (d) => d.toISOString().slice(0, 19).replace("T", " ");
function weekBounds() {
  const now = new Date();
  const utcDay = (now.getUTCDay() + 6) % 7; // Mon=0
  const ws = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - utcDay));
  const lws = new Date(ws); lws.setUTCDate(ws.getUTCDate() - 7);
  return { weekStart: fmt(ws), lastWeekStart: fmt(lws) };
}
// 做题数量排行(排除已删用户和开发者调试账号)
export function ranking(since, until) {
  let sql = "SELECT u.id, u.username, COUNT(a.id) n FROM users u JOIN exams e ON e.user_id=u.id JOIN attempts a ON a.exam_id=e.id WHERE a.mode!='resolved' AND u.deleted_at IS NULL AND COALESCE(u.is_developer,0)=0";
  const p = [];
  if (since) { sql += " AND a.created_at>=?"; p.push(since); }
  if (until) { sql += " AND a.created_at<?"; p.push(until); }
  sql += " GROUP BY u.id HAVING n>0 ORDER BY n DESC, u.id ASC LIMIT 50";
  return db.prepare(sql).all(...p);
}
export function leaderboard() {
  const { weekStart, lastWeekStart } = weekBounds();
  const total = ranking(null, null);
  const weekly = ranking(weekStart, null);
  const lastWeek = ranking(lastWeekStart, weekStart);
  const champion = lastWeek[0] ? { id: lastWeek[0].id, username: lastWeek[0].username, n: lastWeek[0].n } : null;
  return { total, weekly, champion };
}
// 有嘲讽资格 = 上周周榜榜一 或 总榜榜一
export function isChampion(userId) {
  const lb = leaderboard();
  const weeklyTop = lb.champion;                    // 上周周榜榜一
  const totalTop = lb.total[0] || null;             // 总榜榜一(累计)
  return !!((weeklyTop && weeklyTop.id === userId) || (totalTop && totalTop.id === userId));
}
export const STICKERS = { taunt: 4, disdain: 4 };
export function pickSticker(kind) {
  const n = STICKERS[kind] || 4;
  return `${kind}-${1 + Math.floor(Math.random() * n)}.png`;
}
