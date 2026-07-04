"use client";
import { usePathname } from "next/navigation";
import Nav from "@/components/Nav";
import FeedbackButton from "@/components/FeedbackButton";

// 营销/登录类公开页不套应用外壳(无导航、无反馈按钮、不限宽,全屏铺满)
const BARE = ["/login", "/welcome", "/privacy"];

export default function AppShell({ children }) {
  const path = usePathname();
  if (BARE.includes(path)) return children;
  return (
    <>
      <div className="app-bg" />
      <div className="relative z-10 mx-auto max-w-3xl px-4 pb-28 pt-4 md:pb-10 md:pt-20">{children}</div>
      <Nav />
      <FeedbackButton />
    </>
  );
}
