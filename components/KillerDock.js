"use client";
import KillerChat from "@/components/KillerChat";
import { useEffect } from "react";
import * as lab from "@/lib/uilab/store";

// 浮动杀手卡片:只在"没有 v2 布局"时出现(默认首页)。启用分区布局后,杀手作为"栏目"由分区渲染,这里隐藏。
export default function KillerDock() {
  const S = lab.useUiLab();
  useEffect(() => {
    lab.initClient();
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => lab.setDesktop(mq.matches); on();
    try { mq.addEventListener("change", on); } catch { mq.addListener(on); }
    return () => { try { mq.removeEventListener("change", on); } catch { mq.removeListener(on); } };
  }, []);
  if (lab.contentToRender()) return null;
  return (
    <aside className="hidden md:flex fixed right-5 top-20 bottom-4 w-[440px] lg:w-[480px] z-30 flex-col overflow-hidden rounded-3xl border border-[#e4d5af] bg-[#f6efdc]/95 px-3 pb-3 pt-3 shadow-xl shadow-[#3d2b10]/10 backdrop-blur-xl">
      <KillerChat />
    </aside>
  );
}
