import db from "@/lib/db";
import { nowStamp, nowMs } from "@/lib/devtime";
import { pushUser } from "@/lib/notify";

// 排一个提醒:offsetDays/offsetHours 从"现在"(含日期穿越偏移)起算;或给绝对 dueAt("YYYY-MM-DD HH:MM")。
export function addReminder(userId, examId, { text, offsetDays = 0, offsetHours = 0, dueAt = null }) {
  let ms;
  if (dueAt) { const d = new Date(String(dueAt).replace(" ", "T")); ms = isNaN(d.getTime()) ? nowMs() : d.getTime(); }
  else ms = nowMs() + (Number(offsetDays) || 0) * 86400000 + (Number(offsetHours) || 0) * 3600000;
  const due = new Date(ms).toISOString().slice(0, 19).replace("T", " ");
  const info = db.prepare("INSERT INTO reminders(user_id,exam_id,text,due_at,delivered) VALUES(?,?,?,?,0)").run(userId, examId || null, String(text || "").slice(0, 300), due);
  return { id: info.lastInsertRowid, dueAt: due };
}

// 投递某用户所有到期未送的提醒(进收件箱 + 尝试推送),幂等。返回投递条数。
export async function deliverDue(userId) {
  let rows = [];
  try { rows = db.prepare("SELECT * FROM reminders WHERE user_id=? AND delivered=0 AND due_at <= ?").all(userId, nowStamp()); } catch { return 0; }
  for (const r of rows) {
    // 【到点提醒只走应用外推送,不进收件箱】收件箱是留存性的信件(公告/更新/汇总),提醒是一次性的、到点就该弹在系统通知里。
    try { await pushUser(userId, { title: "⏰ Kill Your Exam", body: r.text || "", url: "/" }); } catch {}
    try { db.prepare("UPDATE reminders SET delivered=1 WHERE id=?").run(r.id); } catch {}
  }
  return rows.length;
}

// 后台轮询:扫所有用户到期未送的提醒并投递(服务进程常驻时给真·到点推送,用户不在看也能收到)。只启动一次。
export function startReminderLoop() {
  if (globalThis.__kye_reminder_loop) return;
  globalThis.__kye_reminder_loop = true;
  const tick = async () => {
    try {
      const ids = db.prepare("SELECT DISTINCT user_id FROM reminders WHERE delivered=0 AND due_at <= ?").all(nowStamp());
      for (const { user_id } of ids) { try { await deliverDue(user_id); } catch {} }
    } catch {}
  };
  try { setInterval(tick, 60000); } catch {}
  setTimeout(tick, 5000);
}
