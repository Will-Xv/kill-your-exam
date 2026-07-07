"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useT } from "@/components/I18n";

// 全站实时监听嘲讽/不屑:轮询待处理项,来了就弹出(即使在录音/录像时也能立即看到)。可连续处理多条。
export default function TauntWatcher() {
  const t = useT();
  const path = usePathname();
  const [item, setItem] = useState(null);
  const [canTaunt, setCanTaunt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imgOk, setImgOk] = useState(true);
  const timer = useRef(null);

  async function poll() {
    try {
      const r = await fetch("/api/taunt");
      if (!r.ok) return;
      const d = await r.json();
      setCanTaunt(!!d.canTaunt);
      setItem((cur) => cur || d.item || null); // 有正在显示的就不打断,处理完再拉下一条
    } catch {}
  }
  useEffect(() => {
    if (path === "/login" || path?.startsWith("/onboarding")) return;
    poll();
    timer.current = setInterval(poll, 10000);
    const onVis = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(timer.current); document.removeEventListener("visibilitychange", onVis); };
  }, [path]);

  useEffect(() => { setImgOk(true); }, [item?.id]);

  async function resolve(reply) {
    if (!item || busy) return;
    setBusy(true);
    try { await fetch("/api/taunt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resolve", id: item.id, reply }) }); } catch {}
    setItem(null); setBusy(false);
    setTimeout(poll, 200); // 立刻看有没有下一条
  }

  if (!item) return null;
  const isTaunt = item.kind === "taunt";
  const title = (isTaunt ? t("你收到了来自 {name} 的嘲讽") : t("你的嘲讽受到了 {name} 的不屑")).replace("{name}", item.fromName);
  const fallback = isTaunt ? "🗡️😈" : "😒🙄";
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl bg-[#f6efdd] p-5 text-center shadow-2xl ring-1 ring-amber-900/20">
        <div className="mx-auto mb-3 flex h-40 w-40 items-center justify-center overflow-hidden rounded-2xl bg-amber-100/60">
          {imgOk ? <img src={`/taunts/${item.sticker}`} alt="" className="h-full w-full object-contain" onError={() => setImgOk(false)} /> : <span className="text-6xl">{fallback}</span>}
        </div>
        <p className="text-lg font-black text-[#5a2d0c]">{title}</p>
        <div className="mt-4 flex flex-col gap-2">
          {isTaunt ? (
            <>
              <button className="btn w-full py-2.5" onClick={() => resolve("ok")} disabled={busy}>{t("知道了")}</button>
              <button className="btn-ghost w-full py-2.5 font-semibold text-red-600" onClick={() => resolve("disdain")} disabled={busy}>😒 {t("知道了,但是表示很不屑")}</button>
            </>
          ) : (
            <>
              <button className="btn w-full py-2.5" onClick={() => resolve("ok")} disabled={busy}>{t("知道了")}</button>
              {canTaunt && <button className="btn-ghost w-full py-2.5 font-semibold text-red-600" onClick={() => resolve("retaunt")} disabled={busy}>🗡️ {t("再次嘲讽")}</button>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
