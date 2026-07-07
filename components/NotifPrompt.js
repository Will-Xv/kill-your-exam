"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useT } from "@/components/I18n";
import { enablePush, pushSupported, iosNeedsInstall } from "@/lib/pushClient";

const KEY = "kye_notif_prompt";

// 主动向新用户询问一次是否开启消息提醒(防止有人不知道有这个功能)。
export default function NotifPrompt() {
  const t = useT();
  const path = usePathname();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (path === "/login" || path === "/welcome" || path?.startsWith("/onboarding")) return;
    if (!pushSupported() || Notification.permission !== "default") return;
    try { if (localStorage.getItem(KEY)) return; } catch {}
    let alive = true;
    fetch("/api/push").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (alive && d && !d.subscribed) setTimeout(() => alive && setShow(true), 1800);
    }).catch(() => {});
    return () => { alive = false; };
  }, [path]);

  function dismiss() { try { localStorage.setItem(KEY, "1"); } catch {} setShow(false); }
  async function enable() { setBusy(true); try { await enablePush(); } catch {} dismiss(); setBusy(false); }

  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-3xl bg-[#f6efdd] p-5 shadow-2xl ring-1 ring-amber-900/20">
        <p className="text-lg font-black text-[#5a2d0c]">🔔 {t("开启消息提醒?")}</p>
        <p className="mt-2 text-sm text-stone-600">{t("有人嘲讽你、有新功能公告、或你反馈的 Bug 有回复时,第一时间提醒你。随时能在「设置」里关掉。")}</p>
        {iosNeedsInstall() && <p className="mt-2 text-xs text-amber-700">📲 {t("iPhone / iPad:需先把本网站「添加到主屏幕」,从主屏幕打开后才能收到推送(苹果的限制)。")}</p>}
        <div className="mt-4 flex flex-col gap-2">
          <button className="btn w-full py-2.5" onClick={enable} disabled={busy}>{busy ? t("开启中…") : t("好,开启提醒")}</button>
          <button className="btn-ghost w-full py-2" onClick={dismiss} disabled={busy}>{t("以后再说")}</button>
        </div>
      </div>
    </div>
  );
}
