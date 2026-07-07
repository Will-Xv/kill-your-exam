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
// 谁能嘲讽谁:from 能嘲讽 to 当且仅当在【任意一个榜单】上 from 的排名高于 to。
// (以后可加更多榜单,只要在其中一个榜上比对方靠前即可嘲讽;是否可继续嘲讽同理。)
export function rankMaps() {
  const lb = leaderboard();
  const boards = [lb.weekly, lb.total].map((arr) => {
    const m = {};
    arr.forEach((r, i) => { m[r.id] = i; });
    return m;
  });
  return { boards };
}
export function canTauntTarget(fromId, toId, maps) {
  if (!fromId || !toId || fromId === toId) return false;
  const { boards } = maps || rankMaps();
  // 任意一个榜单上 from 排在 to 前面即可
  return boards.some((m) => {
    const fr = m[fromId];
    if (fr === undefined) return false;   // from 不在此榜
    const tr = m[toId];
    if (tr === undefined) return true;    // to 不在此榜 = 排在 from 之后
    return fr < tr;                       // from 排名更靠前
  });
}
// 动态统计 public/taunts/ 下的贴画数量,新增文件即可自动生效,无需改代码。
let _stickerCache = null;
function stickerCounts() {
  if (_stickerCache) return _stickerCache;
  const counts = { taunt: 0, disdain: 0 };
  try {
    const fs = require("fs"), path = require("path");
    const dir = path.join(process.cwd(), "public", "taunts");
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^(taunt|disdain)-(\d+)\.png$/i);
      if (m) counts[m[1].toLowerCase()] = Math.max(counts[m[1].toLowerCase()], Number(m[2]));
    }
  } catch {}
  if (!counts.taunt) counts.taunt = 4;
  if (!counts.disdain) counts.disdain = 4;
  _stickerCache = counts;
  return counts;
}
export function pickSticker(kind) {
  const n = stickerCounts()[kind] || 4;
  return `${kind}-${1 + Math.floor(Math.random() * n)}.png`;
}
