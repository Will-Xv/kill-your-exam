"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useT } from "@/components/I18n";
import { openKiller, useKillerOpen } from "@/lib/killerUi";

// App 内提示:杀手有个改动等你确认。杀手【看不见】的时候才需要它:
//  - 手机端(杀手是浮动气泡)——一直显示;
//  - 电脑端【杀手浮动】时(大面板收起了,确认按钮藏在抽屉里)——也显示,点一下把抽屉叫出来。
//  - 电脑端杀手占大格/常驻时,确认按钮就在眼前,不用横幅。
export default function PendingBanner({ floatDesktop = false }) {
  const t = useT();
  const path = usePathname();
  const [pending, setPending] = useState(false);
  const killerOpen = useKillerOpen();
  useEffect(() => {
    if (path === "/login" || path === "/welcome" || path?.startsWith("/onboarding")) { setPending(false); return; }
    let alive = true;
    const check = () => fetch("/api/chat/run").then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) setPending(!!(d && d.run && d.run.status === "pending")); }).catch(() => {});
    check(); const iv = setInterval(check, 8000);
    return () => { alive = false; clearInterval(iv); };
  }, [path]);
  if (!pending || path === "/chat" || killerOpen) return null; // 抽屉已打开就不用横幅了
  const cls = `${floatDesktop ? "" : "md:hidden"} fixed left-1/2 top-2 z-[80] -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-amber-600/30 hover:bg-amber-700 animate-in`;
  const label = <>🔐 {t("杀手有个改动等你确认")} →</>;
  // 点横幅一律把【当前的杀手浮层/抽屉】叫出来(确认就在里面),不再跳到 /chat 那个独立整页。
  return <button onClick={openKiller} className={cls}>{label}</button>;
}
