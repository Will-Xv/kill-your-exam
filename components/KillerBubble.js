"use client";
import { useState } from "react";
import { useT } from "@/components/I18n";
import KillerChat from "@/components/KillerChat";

// 手机端:一个可开合的小圆浮动按钮,点开是全屏杀手聊天,再点收起。电脑端不渲染。
export default function KillerBubble() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#efe3c4]">
          <div className="flex-1 min-h-0 px-3 pt-2 pb-3"><KillerChat /></div>
          <button aria-label="close" className="fixed right-3 top-3 z-50 grid h-9 w-9 place-items-center rounded-full bg-black/10 text-lg text-[#2f2413]" onClick={() => setOpen(false)}>✕</button>
        </div>
      )}
      {!open && (
        <button onClick={() => setOpen(true)} title={t("问问杀手")}
          className="fixed bottom-24 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-amber-500 to-amber-600 text-2xl text-white shadow-lg shadow-amber-500/30">💬</button>
      )}
    </div>
  );
}
