"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useT } from "@/components/I18n";

// App 内提示:杀手有个改动等你确认(在非聊天页时显示,点进去确认)。
export default function PendingBanner() {
  const t = useT();
  const path = usePathname();
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (path === "/login" || path === "/welcome" || path?.startsWith("/onboarding")) { setPending(false); return; }
    let alive = true;
    const check = () => fetch("/api/chat/run").then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) setPending(!!(d && d.run && d.run.status === "pending")); }).catch(() => {});
    check(); const iv = setInterval(check, 8000);
    return () => { alive = false; clearInterval(iv); };
  }, [path]);
  if (!pending || path === "/chat") return null;
  return (
    <Link href="/chat" className="md:hidden fixed left-1/2 top-2 z-[70] -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-amber-600/30 hover:bg-amber-700 animate-in">
      🔐 {t("杀手有个改动等你确认")} →
    </Link>
  );
}
