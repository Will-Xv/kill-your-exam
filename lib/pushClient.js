// 客户端:开启浏览器推送(申请权限 + 注册 service worker + 订阅 + 上报)
function urlB64ToUint8(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64); const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
export function iosNeedsInstall() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIos = /iP(hone|ad|od)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
  return isIos && !standalone;
}
export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
}
export async function enablePush() {
  if (!pushSupported()) return { ok: false, permission: "unsupported" };
  const p = await Notification.requestPermission();
  if (p !== "granted") return { ok: false, permission: p };
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const d = await fetch("/api/push").then((r) => r.json());
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(d.vapidPublicKey) });
  await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
  return { ok: true, permission: "granted" };
}
