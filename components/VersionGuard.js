"use client";
import { useEffect, useRef } from "react";

// 部署后旧标签页做 SPA 跳转会去拿已失效的代码块 → ChunkLoadError 崩溃。
// 这里:开局记下当前版本;聚焦/定时重查;一旦发现服务端版本变了(有新部署),就把【下一次站内跳转】改成整页加载,
// 让浏览器拉到最新 HTML+代码块,从根上避免拿旧块崩溃(而不是崩了再兜)。
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
    const iv = setInterval(check, 120000);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    // 站内 <a> 跳转:若已知有新版本,改成整页加载(避免 SPA 拿旧块)
    const onClick = (e) => {
      if (!staleRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target && e.target.closest && e.target.closest("a[href]");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || a.target === "_blank" || /^(https?:)?\/\//.test(href) && !href.includes(window.location.host)) return;
      e.preventDefault();
      window.location.assign(href);
    };
    document.addEventListener("click", onClick, true);
    return () => { alive = false; clearInterval(iv); window.removeEventListener("focus", onFocus); document.removeEventListener("click", onClick, true); };
  }, []);
  return null;
}
