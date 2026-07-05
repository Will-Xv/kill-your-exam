import db from "@/lib/db";
import { WHATS_NEW, GUIDE_VERSION } from "@/lib/guide";

// 广播信件(发给所有用户)。key 用来去重投递,已删的不会再投。以后上线新版:加一条即可。
export const LETTERS = [
  { key: "welcome", date: "2026-07-01", title: "📬 欢迎使用 Kill Your Exam",
    body: "把每一场考试当成猎物。这里是你的私人 AI 备考助手——上传资料、AI 讲知识点出练习题、盯进度排计划。有任何更新,都会像信件一样出现在这个收件箱里,看完可以删掉。祝你旗开得胜。\n\n——开发者 Will" },
  { key: `update-v${GUIDE_VERSION}`, date: "2026-07-05", title: "✨ 新功能更新",
    body: WHATS_NEW.map((w) => `**${w.icon} ${w.title}**\n${w.body}`).join("\n\n") },
];

// 把广播信件同步进某用户的收件箱(缺的补上;已存在或已删过的不动)
export function syncInbox(userId) {
  const has = db.prepare("SELECT 1 FROM inbox WHERE user_id=? AND lkey=? LIMIT 1");
  const ins = db.prepare("INSERT INTO inbox(user_id,lkey,title,body,created_at) VALUES(?,?,?,?,?)");
  for (const L of LETTERS) { if (!has.get(userId, L.key)) ins.run(userId, L.key, L.title, L.body, L.date || null); }
}

// 给某个用户单独发一封信(用于开发者定向信件)
export function sendLetter(userId, { title, body, key = null }) {
  return db.prepare("INSERT INTO inbox(user_id,lkey,title,body,created_at) VALUES(?,?,?,?,datetime('now'))").run(userId, key, title, body).lastInsertRowid;
}

export function listInbox(userId) {
  syncInbox(userId);
  return db.prepare("SELECT id,title,body,created_at,read_at FROM inbox WHERE user_id=? AND deleted_at IS NULL ORDER BY (created_at IS NULL), created_at DESC, id DESC").all(userId);
}
export function unreadCount(userId) {
  syncInbox(userId);
  return db.prepare("SELECT COUNT(*) n FROM inbox WHERE user_id=? AND deleted_at IS NULL AND read_at IS NULL").get(userId).n;
}
