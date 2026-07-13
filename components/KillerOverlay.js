"use client";
import { useKillerOpen, closeKiller } from "@/lib/killerUi";
import KillerChat from "@/components/KillerChat";
import { useT } from "@/components/I18n";

// 杀手最小化成入口按钮时,点开=这个全屏抽屉(电脑手机都用)。默认不渲染,openKiller() 打开。
export default function KillerOverlay() {
  const t = useT();
  const open = useKillerOpen();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#e9dcb6]">
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="text-lg font-black text-[#2f2413]">{t("问问杀手")}</div>
        <button aria-label="close" className="grid h-9 w-9 place-items-center rounded-full bg-black/10 text-lg text-[#2f2413]" onClick={closeKiller}>✕</button>
      </div>
      <div className="min-h-0 flex-1 px-3 pb-3 pt-1"><KillerChat /></div>
    </div>
  );
}
