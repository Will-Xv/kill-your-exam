"use client";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";
const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import Nav from "@/components/Nav";
import KillerDock from "@/components/KillerDock";
import KillerBubble from "@/components/KillerBubble";
import TauntWatcher from "@/components/TauntWatcher";
import NotifPrompt from "@/components/NotifPrompt";
import PendingBanner from "@/components/PendingBanner";
import * as lab from "@/lib/uilab/store";
import RouteShell from "@/components/uilab/RouteShell";

// 营销/登录类公开页不套应用外壳
const BARE = ["/login", "/welcome", "/privacy"];

export default function AppShell({ children, initialLayout = null }) {
  const path = usePathname();
  const S = lab.useUiLab();
  useEffect(() => { if (path !== "/" && lab.snap().editing) lab.exitEdit(); }, [path]); // 离开首页即退出编辑,避免编辑态泄漏到其它页
  useIso(() => { if (typeof window === "undefined") return; const mq = window.matchMedia("(min-width: 768px)"); const on = () => lab.setDesktop(mq.matches); on(); try { mq.addEventListener("change", on); } catch { mq.addListener(on); } return () => { try { mq.removeEventListener("change", on); } catch { mq.removeListener(on); } }; }, []); // 绘制前就确定桌面/手机,配合 SSR 布局:刷新时直接出正确外壳,不再闪
  if (BARE.includes(path)) return children;
  // 开发者在首页开启布局(编辑中或已套用某套布局)时,主内容改为全宽画布 —— 不再被「给杀手让出右边一条」限制,
  // 内容与杀手可自由摆放(上下、任意位置)。内容本身不自动放宽,仍保持原来的宽度,只是可被拖到任何地方。
  // 杀手在做题/模拟/聊天页与公开页不出现;其余页面:电脑端右侧常驻面板,手机端浮动小圆按钮
  const hideKiller = path.startsWith("/practice") || path.startsWith("/mock") || path === "/chat" || path.startsWith("/onboarding");
  const showKiller = !hideKiller;
  const onHome = path === "/";
  const applied = lab.contentToRender() || (!S.editing && initialLayout && initialLayout.v === 2 ? initialLayout : null); // 优先用 store;首帧(fetch 未回)用 SSR 传入的已发布布局
  const v2 = S.isDesktop && !!applied; // 已套用/编辑中的 v2 分区布局(桌面)
  const labHome = onHome && S.isDesktop && S.editing; // 首页【编辑中】才用 LayoutLab 编辑器(全宽网格)
  const routeShell = v2 && showKiller && !labHome;    // 其余(含首页已套用)都走统一外壳,杀手共用同一实例、不重载
  const reserve = showKiller && S.isDesktop && !labHome && !routeShell; // 浮动杀手才留右边一条
  const cl = applied;
  return (
    <>
      <div className="app-bg" />
      {routeShell ? (
        <div className="relative z-10"><RouteShell layout={cl}>{children}</RouteShell></div>
      ) : (
        <div className={`relative z-10 ${reserve ? "md:pr-[460px] lg:pr-[500px]" : ""}`}>
          <div className={labHome ? "w-full pb-28 pt-4 md:pb-10 md:pt-20" : "mx-auto max-w-3xl px-4 pb-28 pt-4 md:pb-10 md:pt-20"}>{children}</div>
        </div>
      )}
      <Nav />
      {showKiller && !labHome && !routeShell && <KillerDock />}
      {showKiller && <KillerBubble />}
      <TauntWatcher />
      <NotifPrompt />
      <PendingBanner />
    </>
  );
}
