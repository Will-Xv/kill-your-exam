"use client";
import KillerChat from "@/components/KillerChat";

// 电脑端:右侧一张更大的悬浮聊天卡片(圆角、留边距)。手机端不渲染。
export default function KillerDock() {
  return (
    <aside className="hidden md:flex fixed right-5 top-20 bottom-4 w-[440px] lg:w-[480px] z-30 flex-col overflow-hidden rounded-3xl border border-[#e4d5af] bg-[#f6efdc]/95 px-3 pb-3 pt-3 shadow-xl shadow-[#3d2b10]/10 backdrop-blur-xl">
      <KillerChat />
    </aside>
  );
}
