import db, { getSetting, setSetting } from "@/lib/db";
import webpush from "web-push";

// VAPID 密钥(自动生成并存进 settings,无需手工配置环境变量)
export function getVapid() {
  let pub = getSetting("vapid_public", ""); let priv = getSetting("vapid_private", "");
  if (!pub || !priv) { const k = webpush.generateVAPIDKeys(); pub = k.publicKey; priv = k.privateKey; setSetting("vapid_public", pub); setSetting("vapid_private", priv); }
  return { pub, priv };
}
function configure() {
  const { pub, priv } = getVapid();
  const subject = getSetting("vapid_subject", "mailto:xuy413682@gmail.com");
  webpush.setVapidDetails(subject, pub, priv);
}

const PREF_COL = { updates: "notif_updates", bugfeedback: "notif_bugfeedback", push: "notif_push" };

export function saveSubscription(userId, sub) {
  if (!sub?.endpoint) return;
  db.prepare("INSERT INTO push_subscriptions(user_id,endpoint,keys_json) VALUES(?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, keys_json=excluded.keys_json")
    .run(userId, sub.endpoint, JSON.stringify(sub.keys || {}));
}
export function removeSubscription(endpoint) { if (endpoint) db.prepare("DELETE FROM push_subscriptions WHERE endpoint=?").run(endpoint); }

// 给某用户发一条【消息提醒】(浏览器推送)。category: updates | bugfeedback | push。
// 是否真的推送取决于用户对该类别的开关。收件箱不受影响(收件箱另行投递)。
export async function notifyUser(userId, category, { title, body, url }) {
  const col = PREF_COL[category] || "notif_push";
  const u = db.prepare(`SELECT ${col} pref FROM users WHERE id=?`).get(userId);
  if (!u || !u.pref) return { sent: 0, skipped: "off" };
  const subs = db.prepare("SELECT * FROM push_subscriptions WHERE user_id=?").all(userId);
  if (!subs.length) return { sent: 0 };
  configure();
  const payload = JSON.stringify({ title: title || "Kill Your Exam", body: body || "", url: url || "/inbox" });
  let sent = 0;
  for (const s of subs) {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys_json || "{}") }, payload); sent++; }
    catch (e) { if (e?.statusCode === 404 || e?.statusCode === 410) removeSubscription(s.endpoint); }
  }
  return { sent };
}
