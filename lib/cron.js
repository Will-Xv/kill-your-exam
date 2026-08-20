// 自带定时器(真正的 cron):Railway 上 next start 是常驻进程,用进程内 setInterval 周期性跑 session/每日每周级触发器,
// 不依赖用户打开应用、也不需要外部调度。首个 API 请求时 ensureCron() 启动;单例守卫防止重复。
import db from "@/lib/db";
import { onSession } from "@/lib/triggers";
import { backfillMissing } from "@/lib/backfillIndex";

export async function runScheduledCron() {
  let rows;
  try { rows = db.prepare("SELECT DISTINCT user_id, exam_id FROM learning_modes WHERE active=1 AND triggers LIKE '%session%'").all(); } catch { return; }
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
  // 【自动给没索引的资料补建】新规则上线前上传的 PDF/图片没有 chunks —— 既不再被强制投喂、又检索不到 = 失联。
  // 不让人去点按钮,启动后自己补;之后每 6 小时再扫一遍,顺带兜住"上传时建索引失败"的漏网。
  // 幂等:只挑 chunks 为 0 的,补完之后每轮扫描就只是一句 SQL,不花钱。
  try { setInterval(() => { backfillMissing().catch(() => {}); }, 6 * 60 * 60 * 1000); } catch {}
  setTimeout(() => { backfillMissing().catch(() => {}); }, 60 * 1000); // 启动 1 分钟后开始,先让应用起稳
}
