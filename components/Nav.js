"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/components/I18n";

const primary = [
  { href: "/exams", label: "追杀计划", icon: "🗂️" },
  { href: "/", label: "首页", icon: "🏠" },
  { href: "/materials", label: "补充资料", icon: "📎" },
  { href: "/chat", label: "问问杀手", icon: "💬" }
];
const more = [
  { href: "/mock", label: "模拟考", icon: "📝", desc: "限时全真模拟" },
  { href: "/prep", label: "屠杀准备", icon: "🎒", desc: "考务/应试自测" },
  { href: "/mistakes", label: "错题本", icon: "📕", desc: "重练做错的题" },
  { href: "/notes", label: "笔记本", icon: "📓", desc: "收藏的题+随手笔记" },
  { href: "/profile", label: "你的全部杀技", icon: "🧭", desc: "跨考试综合评估" },
  { href: "/settings", label: "设置", icon: "⚙️", desc: "语言/档案/导出" }
];

export default function Nav() {
  const t = useT();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState(null);
  useEffect(() => { navigator.serviceWorker?.register("/sw.js").catch(() => {}); }, []);
  useEffect(() => { fetch("/api/me").then((r) => r.ok ? r.json() : null).then((d) => setMe(d?.user)).catch(() => {}); }, []);
  useEffect(() => { setOpen(false); }, [path]);
  if (path === "/login" || path.startsWith("/onboarding")) return null;
  const active = (h) => (h === "/" ? path === "/" : path.startsWith(h));

  const extra = [];
  if (me?.isAdmin) extra.push({ href: "/admin", label: "管理面板", icon: "📈", desc: "使用情况/子账号" });
  if (me?.isDeveloper) extra.push({ href: "/dev", label: "开发者工具", icon: "🛠️", desc: "调试" });
  if (me?.isAdmin || me?.isDeveloper) extra.push({ href: "/bugs", label: "Bug 反馈", icon: "🐞", desc: "用户反馈的问题" });

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="absolute bottom-16 left-1/2 w-[92%] max-w-md -translate-x-1/2 md:top-16 md:bottom-auto" onClick={(e) => e.stopPropagation()}>
            <div className="card grid grid-cols-2 gap-2 shadow-2xl animate-in">
              {[...more, ...extra].map((it) => (
                <Link key={it.href} href={it.href} className={`flex items-start gap-2 rounded-2xl p-3 transition ${active(it.href) ? "bg-[#efe0bd] text-[#6b4a25]" : "hover:bg-[#efe6cf]"}`}>
                  <span className="text-xl">{it.icon}</span>
                  <span><span className="block text-sm font-semibold">{t(it.label)}</span><span className="block text-xs text-[#8a7a54]">{t(it.desc)}</span></span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:top-0 md:bottom-auto">
        <div className="mx-auto flex max-w-3xl items-center justify-around gap-1 border-t border-[#e4d5af] bg-[#f6efdc]/95 px-1 py-1.5 backdrop-blur-xl md:mt-3 md:justify-center md:gap-1 md:rounded-full md:border md:border-[#e4d5af] md:px-2 md:shadow-lg">
          {primary.map((it) => (
            <Link key={it.href} href={it.href}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[11px] font-medium transition md:flex-none md:flex-row md:gap-1.5 md:px-4 md:py-2 md:text-sm ${active(it.href) ? "text-[#6b4a25] md:bg-[#efe0bd]" : "text-[#8a6a2c] hover:text-[#2f2413]"}`}>
              <span className="text-lg md:text-base">{it.icon}</span><span>{t(it.label)}</span>
            </Link>
          ))}
          <button onClick={() => setOpen(!open)}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[11px] font-medium transition md:flex-none md:flex-row md:gap-1.5 md:px-4 md:py-2 md:text-sm ${open ? "text-[#6b4a25] md:bg-[#efe0bd]" : "text-[#8a6a2c] hover:text-[#2f2413]"}`}>
            <span className="text-lg md:text-base">☰</span><span>{t("更多")}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
