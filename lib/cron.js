// 自带定时器(真正的 cron):Railway 上 next start 是常驻进程,用进程内 setInterval 周期性跑 session/每日每周级触发器,
// 不依赖用户打开应用、也不需要外部调度。首个 API 请求时 ensureCron() 启动;单例守卫防止重复。
import db from "@/lib/db";
import { onSession } from "@/lib/triggers";

export async function runScheduledCron() {
  let rows;
  try { rows = db.prepare("SELECT DISTINCT user_id, exam_id FROM learning_modes WHERE active=1 AND triggers LIKE '%session%' AND user_id IN (SELECT id FROM users WHERE is_developer=1)").all(); } catch { return; }
  for (const r of rows) {
    let exams = [];
    try { exams = r.exam_id != null ? [r.exam_id] : db.prepare("SELECT id FROM exams WHERE user_id=?").all(r.user_id).map((e) => e.id); } catch {}
    for (const eid of exams) { try { await onSession(r.user_id, eid); } catch {} }
  }
}

export function ensureCron() {
  if (globalThis.__kye_cron) return;
  globalThis.__kye_cron = true;
  try { setInterval(() => { runScheduledCron().catch(() => {}); }, 20 * 60 * 1000); } catch {} // 每20分钟
  setTimeout(() => { runScheduledCron().catch(() => {}); }, 5000); // 启动后先跑一次
}
