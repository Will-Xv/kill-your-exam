"use client";
import { useEffect, useRef } from "react";

// 部署后旧标签页做 SPA 跳转会去拿已失效的代码块 → ChunkLoadError 崩溃。
// 双保险,尽量从根上避免、而不是崩了再兜:
// ①【尽早发现新部署】开局记版本;可见性变化/返回应用/聚焦/较短轮询都重查——你一回到应用就知道有没有新部署。
// ②【已知有新部署 → 下次站内跳转走整页加载】拿到最新 HTML+代码块,根本不去请求旧块。
export default function VersionGuard() {
  const baseRef = useRef(null);
  const staleRef = useRef(false);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const d = await r.json();
        if (!alive || !d || !d.v) return;
        if (baseRef.current == null) baseRef.current = d.v;
        else if (d.v !== baseRef.current) staleRef.current = true;
      } catch {}
    };
    check();
    const iv = setInterval(check, 30000);                       // 30s 轮询(原 120s 太久)
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVis);       // 手机切回应用最可靠
    window.addEventListener("pageshow", check);                 // bfcache 恢复

    // 站内 <a>/<Link> 跳转:若已知有新版本,改成整页加载(避免 SPA 拿旧块)
    const onClick = (e) => {
      if (!staleRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target && e.target.closest && e.target.closest("a[href]");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || a.target === "_blank" || (/^(https?:)?\/\//.test(href) && !href.includes(window.location.host))) return;
      e.preventDefault();
      window.location.assign(href);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      alive = false; clearInterval(iv);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  return null;
}
