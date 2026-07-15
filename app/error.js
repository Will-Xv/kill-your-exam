"use client";
import { useEffect } from "react";
import { useT } from "@/components/I18n";

// 页面级错误兜底(跟随界面语言)。首次加载的瞬态错误(部署后旧代码块 / 初始化竞态)多数刷新即好 → 自动硬刷新一次自愈;
// 20s 内不重复,避免真·持续报错死循环(那种会停在本页让主人手动处理)。VersionGuard 会在有新部署时改走整页加载,从根上少触发。
export default function Error({ error, reset }) {
  const t = useT();
  useEffect(() => {
    try { console.error("[app error boundary]", (error && (error.stack || error.message)) || error); } catch {}
    try {
      const KEY = "kye_err_reload_at";
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last > 20000) { sessionStorage.setItem(KEY, String(Date.now())); window.location.reload(); }
    } catch {}
  }, [error]);
  return (
    <div className="mx-auto mt-20 max-w-md px-6 text-center">
      <div className="text-4xl">🛠️</div>
      <h1 className="mt-3 text-lg font-bold text-stone-800">{t("出了点小状况")}</h1>
      <p className="mt-2 text-sm text-stone-500">{t("这一页没能正常加载。多数情况刷新一下就好——你的数据没丢。")}</p>
      <div className="mt-5 flex justify-center gap-2">
        <button onClick={() => { try { reset(); } catch { window.location.reload(); } }} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white">{t("重试")}</button>
        <button onClick={() => window.location.reload()} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700">{t("刷新页面")}</button>
      </div>
    </div>
  );
}
