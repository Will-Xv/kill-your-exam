"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "今天", icon: "🏠" },
  { href: "/study", label: "学习", icon: "📖" },
  { href: "/practice", label: "练习", icon: "✍️" },
  { href: "/materials", label: "资料", icon: "📚" },
  { href: "/chat", label: "聊天", icon: "💬" },
  { href: "/settings", label: "设置", icon: "⚙️" }
];

export default function Nav() {
  const path = usePathname();
  if (path === "/login" || path.startsWith("/onboarding")) return null;
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur md:top-0 md:bottom-auto md:border-b md:border-t-0">
      <div className="mx-auto flex max-w-3xl justify-around md:justify-center md:gap-8">
        {items.map((it) => (
          <Link key={it.href} href={it.href}
            className={`flex flex-col items-center gap-0.5 px-3 py-2 text-xs md:flex-row md:text-sm ${path === it.href ? "text-emerald-700 font-semibold" : "text-stone-500"}`}>
            <span className="text-lg md:text-base">{it.icon}</span>
            {it.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
