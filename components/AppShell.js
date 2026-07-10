"use client";
import { usePathname } from "next/navigation";
import Nav from "@/components/Nav";
import KillerDock from "@/components/KillerDock";
import KillerBubble from "@/components/KillerBubble";
import TauntWatcher from "@/components/TauntWatcher";
import NotifPrompt from "@/components/NotifPrompt";
import PendingBanner from "@/components/PendingBanner";
import * as lab from "@/lib/uilab/store";

// 营销/登录类公开页不套应用外壳
const BARE = ["/login", "/welcome", "/privacy"];

export default function AppShell({ children }) {
  const path = usePathname();
  const S = lab.useUiLab();
  if (BARE.includes(path)) return children;
  // 开发者在首页开启布局(编辑中或已套用某套布局)时,主内容改为全宽画布 —— 不再被「给杀手让出右边一条」限制,
  // 内容与杀手可自由摆放(上下、任意位置)。内容本身不自动放宽,仍保持原来的宽度,只是可被拖到任何地方。
  // 杀手在做题/模拟/聊天页与公开页不出现;其余页面:电脑端右侧常驻面板,手机端浮动小圆按钮
  const hideKiller = path.startsWith("/practice") || path.startsWith("/mock") || path === "/chat" || path.startsWith("/onboarding");
  const showKiller = !hideKiller;
  const labHome = path === "/" && S.isDesktop && lab.hasHomeLayout();
  const reserve = showKiller && S.isDesktop && !lab.contentToRender(); // 没有 v2 布局时才为浮动杀手留右边一条
  return (
    <>
      <div className="app-bg" />
      <div className={`relative z-10 ${reserve ? "md:pr-[460px] lg:pr-[500px]" : ""}`}>
        <div className={labHome ? "w-full pb-28 pt-4 md:pb-10 md:pt-20" : "mx-auto max-w-3xl px-4 pb-28 pt-4 md:pb-10 md:pt-20"}>{children}</div>
      </div>
      <Nav />
      {showKiller && <KillerDock />}
      {showKiller && <KillerBubble />}
      <TauntWatcher />
      <NotifPrompt />
      <PendingBanner />
    </>
  );
}
