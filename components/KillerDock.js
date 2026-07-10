"use client";
import KillerChat from "@/components/KillerChat";

// 电脑端:右侧常驻的杀手面板(全尺寸,占右边横屏空间)。手机端不渲染。
export default function KillerDock() {
  return (
    <aside className="hidden md:flex fixed right-0 top-0 bottom-0 w-[400px] z-30 flex-col border-l border-[#e4d5af] bg-[#f6efdc]/95 px-3 pb-3 pt-[76px] backdrop-blur-xl">
      <KillerChat />
    </aside>
  );
}
