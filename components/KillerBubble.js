"use client";
import { useT } from "@/components/I18n";
import { openKiller, useKillerOpen } from "@/lib/killerUi";

// 手机端:一个小圆浮动按钮,点开=全屏杀手聊天(走全局 KillerOverlay,killerOpen=true)。
// 用全局开关(而非本地 state)是为了让 PendingBanner 等"杀手看不见时才提示"的组件知道聊天已在前台,别再弹"决策前提醒"。
export default function KillerBubble() {
  const t = useT();
  const open = useKillerOpen();
  if (open) return null; // 打开时由 KillerOverlay 全屏接管(它带"问问杀手"标题+✕)
  return (
    <div className="md:hidden">
      <button onClick={openKiller} title={t("问问杀手")}
        className="fixed bottom-24 right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-amber-500 to-amber-600 text-2xl text-white shadow-lg shadow-amber-500/30">💬</button>
    </div>
  );
}
