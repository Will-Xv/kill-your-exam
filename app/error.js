"use client";
import { useEffect } from "react";

// 页面级错误兜底:把 Next 默认的白屏 "Application error" 换成友好界面。
// 部署后旧标签页会拿到已失效的代码块(ChunkLoadError)→ 首次跳转崩溃、刷新就好;这里检测到就自动硬刷新一次拉最新代码。
export default function Error({ error, reset }) {
  useEffect(() => {
    // 首次加载的瞬态错误(部署后旧代码块 / 初始化时序竞态等)多数刷新即好 → 自动硬刷新一次自愈;
    // 20s 内不重复,避免真·持续报错时死循环(那种会停在本友好页,让主人手动处理)。
    try {
      const KEY = "kye_err_reload_at";
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last > 20000) { sessionStorage.setItem(KEY, String(Date.now())); window.location.reload(); }
    } catch {}
  }, [error]);
  return (
    <div className="mx-auto mt-20 max-w-md px-6 text-center">
      <div className="text-4xl">🛠️</div>
      <h1 className="mt-3 text-lg font-bold text-stone-800">出了点小状况 · Something went wrong</h1>
      <p className="mt-2 text-sm text-stone-500">这一页没能正常加载。多数情况刷新一下就好——你的数据没丢。<br />This page failed to load. A refresh usually fixes it — your data is safe.</p>
      <div className="mt-5 flex justify-center gap-2">
        <button onClick={() => { try { reset(); } catch { window.location.reload(); } }} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white">重试 · Retry</button>
        <button onClick={() => window.location.reload()} className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700">刷新 · Reload</button>
      </div>
    </div>
  );
}
