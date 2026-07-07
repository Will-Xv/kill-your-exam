"use client";
import { useEffect, useState } from "react";
import { useT } from "@/components/I18n";

function urlB64ToUint8(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64); const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function NotifSettings() {
  const t = useT();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

  useEffect(() => { fetch("/api/push").then((r) => r.json()).then(setData).catch(() => {}); }, []);

  async function enable() {
    if (!supported) return;
    setBusy(true);
    try {
      const p = await Notification.requestPermission(); setPerm(p);
      if (p !== "granted") { setBusy(false); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const d = data || (await fetch("/api/push").then((r) => r.json()));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(d.vapidPublicKey) });
      await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      setData((x) => ({ ...(x || d), subscribed: true }));
    } catch (e) { /* ignore */ }
    setBusy(false);
  }

  async function toggle(key) {
    const prefs = { ...(data?.prefs || {}), [key]: !data?.prefs?.[key] };
    setData((x) => ({ ...x, prefs }));
    await fetch("/api/push", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefs: { [key]: prefs[key] } }) }).catch(() => {});
  }

  if (!data) return null;
  const on = perm === "granted" && data.subscribed;
  const rows = [
    ["updates", t("更新信息"), t("有新功能/公告时提醒你(收件箱也会收到)")],
    ["bugfeedback", t("Bug 反馈回复"), t("你反馈的问题有回复时提醒你(收件箱也会收到)")],
    ["push", t("推送消息"), t("排名、活动等推送(只作提醒,不进收件箱)")],
  ];
  return (
    <div className="card">
      <h2 className="font-semibold">🔔 {t("消息提醒")}</h2>
      <p className="text-xs text-stone-500 mt-1">{t("开启后可像聊天软件一样收到提醒。这些开关只影响提醒;收件箱始终会收到更新信息和 Bug 反馈回复,不受影响。")}</p>
      {!supported && <p className="text-xs text-amber-700 mt-2">{t("当前浏览器不支持消息提醒。")}</p>}
      {supported && !on && (
        <button className="btn mt-2" onClick={enable} disabled={busy}>{busy ? t("开启中…") : t("开启消息提醒")}</button>
      )}
      {supported && perm === "denied" && <p className="text-xs text-amber-700 mt-2">{t("已在浏览器里被拒绝,请到浏览器站点设置里允许通知。")}</p>}
      {supported && on && <p className="text-xs text-emerald-700 mt-2">✓ {t("消息提醒已开启")}</p>}
      <div className="mt-3 space-y-2">
        {rows.map(([key, label, desc]) => (
          <label key={key} className="flex items-start justify-between gap-3">
            <span><span className="text-sm font-medium">{label}</span><br /><span className="text-xs text-stone-400">{desc}</span></span>
            <input type="checkbox" className="mt-1 h-5 w-5 accent-amber-600" checked={!!data.prefs?.[key]} onChange={() => toggle(key)} />
          </label>
        ))}
      </div>
    </div>
  );
}
