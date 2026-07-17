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
import KillerOverlay from "@/components/KillerOverlay";
import { openKiller } from "@/lib/killerUi";
import { useT } from "@/components/I18n";
import * as lab from "@/lib/uilab/store";
import * as placement from "@/lib/uilab/placement";
import RouteShell from "@/components/uilab/RouteShell";

// 营销/登录类公开页不套应用外壳
const BARE = ["/login", "/welcome", "/privacy", "/arena"];

export default function AppShell({ children, initialLayout = null }) {
  const path = usePathname();
  const t = useT();
  const S = lab.useUiLab();
  useEffect(() => { if (path !== "/" && lab.snap().editing) lab.exitEdit(); }, [path]);
  useEffect(() => { fetch("/api/triggers/tick", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; } })() }) }).catch(() => {}); }, []); // 打开应用时触发 session/每日/每周级触发器 // 离开首页即退出编辑,避免编辑态泄漏到其它页
  useIso(() => { if (typeof window === "undefined") return; const mq = window.matchMedia("(min-width: 768px)"); const on = () => lab.setDesktop(mq.matches); on(); try { mq.addEventListener("change", on); } catch { mq.addListener(on); } return () => { try { mq.removeEventListener("change", on); } catch { mq.removeListener(on); } }; }, []); // 绘制前就确定桌面/手机,配合 SSR 布局:刷新时直接出正确外壳,不再闪
  placement.useItems();   // 【必须在提前 return 之前调用】否则 BARE 页(如 /arena)会少调这个 Hook,SPA 从别的页切过来时 Hook 数量变化 → React #300 崩溃
  if (BARE.includes(path)) return children;
  // 开发者在首页开启布局(编辑中或已套用某套布局)时,主内容改为全宽画布 —— 不再被「给杀手让出右边一条」限制,
  // 内容与杀手可自由摆放(上下、任意位置)。内容本身不自动放宽,仍保持原来的宽度,只是可被拖到任何地方。
  // 杀手在做题/模拟/聊天页与公开页不出现;其余页面:电脑端右侧常驻面板,手机端浮动小圆按钮
  const hideKiller = path.startsWith("/practice") || path.startsWith("/mock") || path.startsWith("/arena") || path === "/chat" || path.startsWith("/onboarding") || path.startsWith("/upload-quiz");
  const showKiller = !hideKiller;
  const onHome = path === "/";
  const applied = lab.contentToRender() || (!S.editing && initialLayout && initialLayout.v === 2 ? initialLayout : null); // 优先用 store;首帧(fetch 未回)用 SSR 传入的已发布布局
  const labHome = onHome && S.isDesktop && S.editing; // 首页【编辑中】才用 LayoutLab 编辑器(全宽网格)
  const _pact = placement.active();
  const _bp = S.isDesktop ? "desktop" : "mobile";
  const killerHome = _pact ? placement.killerHomeOf(placement.renderPlacement(), _bp) : "dock";
  const killerFloatDesktop = showKiller && S.isDesktop && (killerHome === "float" || (!!applied && applied.template === "single")); // 电脑端:显式浮动 或 整列布局 → 杀手浮动(不占侧栏/分区)
  const routeShell = !!applied && showKiller && !labHome && !killerFloatDesktop; // 浮动时不走分区大面板
  const reserve = showKiller && S.isDesktop && !labHome && !routeShell && !killerFloatDesktop; // 浮动/整列时不给右边留常驻位
  const cl = applied;
  const _defDock = S.isDesktop ? "top" : "bottom";
  const _navDock = _pact ? placement.navDockOf(placement.renderPlacement(), _bp) : _defDock;
  const _dockCustom = !!(_pact && _navDock && _navDock !== _defDock);
  const padCls = !_dockCustom ? "pb-28 pt-4 md:pb-10 md:pt-20"
    : _navDock === "top" ? "pt-24 pb-6"
    : _navDock === "bottom" ? "pb-24 pt-6"
    : "pt-4 pb-10"; // left/right:上下正常留白,横向留白由 xCls 负责
  const xCls = !_dockCustom ? "px-4" : _navDock === "left" ? "pl-20 pr-4" : _navDock === "right" ? "pr-20 pl-4" : "px-4"; // 竖排导航栏时给内容让出侧边;默认=px-4 零回归
  return (
    <>
      <div className="app-bg" />
      {routeShell ? (
        <div className="relative z-10"><RouteShell layout={cl}>{children}</RouteShell></div>
      ) : (
        <div className={`relative z-10 ${reserve ? "md:pr-[460px] lg:pr-[500px]" : ""}`}>
          <div className={labHome ? `w-full ${xCls} ${padCls}` : `mx-auto max-w-3xl ${xCls} ${padCls}`}>{children}</div>
        </div>
      )}
      <Nav />
      {showKiller && !labHome && !routeShell && !killerFloatDesktop && <KillerDock />}
      {showKiller && <KillerBubble />}
      {killerFloatDesktop && <button onClick={openKiller} title={t("问问杀手")} className="fixed bottom-6 right-6 z-40 hidden h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-amber-500 to-amber-600 text-2xl text-white shadow-lg shadow-amber-500/30 md:grid">💬</button>}
      {showKiller && <KillerOverlay />}
      <TauntWatcher />
      <NotifPrompt />
      <PendingBanner floatDesktop={killerFloatDesktop} />
    </>
  );
}
