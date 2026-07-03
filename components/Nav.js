"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useT } from "@/components/I18n";

const items = [
  { href: "/", label: "今天", icon: "🏠" },
  { href: "/study", label: "学习", icon: "📖" },
  { href: "/practice", label: "练习", icon: "✍️" },
  { href: "/mock", label: "模拟考", icon: "📝" },
  { href: "/materials", label: "资料", icon: "📚" },
  { href: "/chat", label: "聊天", icon: "💬" },
  { href: "/settings", label: "设置", icon: "⚙️" }
];

export default function Nav() {
  const t = useT();
  const path = usePathname();
  useEffect(() => { navigator.serviceWorker?.register("/sw.js").catch(() => {}); }, []);
  if (path === "/login" || path.startsWith("/onboarding")) return null;
  const active = (h) => (h === "/" ? path === "/" : path.startsWith(h));
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:top-0 md:bottom-auto">
      <div className="mx-auto flex max-w-3xl items-center justify-around gap-1 border-t border-slate-200 bg-white/85 px-1 py-1.5 backdrop-blur-xl md:mt-3 md:justify-center md:gap-1 md:rounded-full md:border md:px-2 md:shadow-lg">
        {items.map((it) => (
          <Link key={it.href} href={it.href}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[11px] font-medium transition md:flex-none md:flex-row md:gap-1.5 md:px-4 md:py-2 md:text-sm ${active(it.href) ? "text-emerald-700 md:bg-emerald-50" : "text-slate-500 hover:text-slate-800"}`}>
            <span className="text-lg md:text-base">{it.icon}</span>
            <span>{t(it.label)}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
