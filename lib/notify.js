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
// 直接推送(不看三个类别开关,只要用户开了通知/有订阅就发)——用于重要的功能性提醒,如"杀手等你确认"。
// 主人的【应用外推送】现在到底能不能发:要同时满足"没关推送开关"且"至少有一个已注册的设备订阅"。
// 给杀手用:承诺"到点提醒你"之前先看这个,没开就如实说清楚(否则提醒发不出去,主人还以为设好了)。
export function pushStatus(userId) {
  try {
    const u = db.prepare("SELECT notif_push FROM users WHERE id=?").get(userId);
    const subs = db.prepare("SELECT COUNT(*) n FROM push_subscriptions WHERE user_id=?").get(userId)?.n || 0;
    const prefOn = !u || u.notif_push == null ? true : !!u.notif_push;
    if (!prefOn) return { enabled: false, reason: "pref_off" };
    if (!subs) return { enabled: false, reason: "no_subscription" };
    return { enabled: true, devices: subs };
  } catch { return { enabled: false, reason: "unknown" }; }
}

export async function pushUser(userId, { title, body, url }) {
  const subs = db.prepare("SELECT * FROM push_subscriptions WHERE user_id=?").all(userId);
  if (!subs.length) return { sent: 0 };
  configure();
  const payload = JSON.stringify({ title: title || "Kill Your Exam", body: body || "", url: url || "/" });
  let sent = 0;
  for (const s of subs) {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys_json || "{}") }, payload); sent++; }
    catch (e) { if (e?.statusCode === 404 || e?.statusCode === 410) removeSubscription(s.endpoint); }
  }
  return { sent };
}
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
