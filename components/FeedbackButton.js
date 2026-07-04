"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/components/I18n";

// 显眼但不占导航栏的悬浮"意见反馈"按钮,全站可见。
export default function FeedbackButton() {
  const t = useT();
  const path = usePathname();
  if (path === "/feedback" || path === "/login") return null;
  return (
    <Link
      href="/feedback"
      title={t("意见反馈")}
      className="fixed bottom-24 right-4 z-40 flex items-center gap-1.5 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/30 transition hover:-translate-y-0.5 hover:shadow-xl md:bottom-6 md:right-6"
    >
      ✉️ <span>{t("反馈")}</span>
    </Link>
  );
}
