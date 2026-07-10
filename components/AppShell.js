"use client";
import { usePathname } from "next/navigation";
import Nav from "@/components/Nav";
import KillerDock from "@/components/KillerDock";
import KillerBubble from "@/components/KillerBubble";
import TauntWatcher from "@/components/TauntWatcher";
import NotifPrompt from "@/components/NotifPrompt";
import PendingBanner from "@/components/PendingBanner";

// 营销/登录类公开页不套应用外壳
const BARE = ["/login", "/welcome", "/privacy"];

export default function AppShell({ children }) {
  const path = usePathname();
  if (BARE.includes(path)) return children;
  // 杀手在做题/模拟/聊天页与公开页不出现;其余页面:电脑端右侧常驻面板,手机端浮动小圆按钮
  const hideKiller = path.startsWith("/practice") || path.startsWith("/mock") || path === "/chat" || path.startsWith("/onboarding");
  const showKiller = !hideKiller;
  return (
    <>
      <div className="app-bg" />
      <div className={`relative z-10 mx-auto max-w-3xl px-4 pb-28 pt-4 md:pb-10 md:pt-20 ${showKiller ? "md:mx-0 md:ml-8 md:mr-[400px]" : ""}`}>{children}</div>
      <Nav />
      {showKiller && <KillerDock />}
      {showKiller && <KillerBubble />}
      <TauntWatcher />
      <NotifPrompt />
      <PendingBanner />
    </>
  );
}
