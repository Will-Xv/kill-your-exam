"use client";
import { useRef, useState, useCallback, useEffect } from "react";
import { TEMPLATES } from "@/lib/uilab/templates";
import KillerChat from "@/components/KillerChat";
import * as lab from "@/lib/uilab/store";

// 统一外壳:杀手固定在它在布局里的那一格(和首页同位置/大小),其余格子合并成一个内容区渲染当前页面。
// 服务端首帧就渲染(不依赖客户端 isDesktop),内容永不重挂;手机端由 CSS 收成单列并隐藏内联杀手(改用浮动气泡)。
export default function RouteShell({ layout, children }) {
  const S = lab.useUiLab();
  const t = TEMPLATES[layout && layout.template] || TEMPLATES.single;
  const vpRef = useRef(null);
  const [bar, setBar] = useState(null);
  const recompute = useCallback(() => {
    const el = vpRef.current; if (!el) return;
    const track = el.clientHeight, sh = el.scrollHeight;
    if (sh <= el.clientHeight + 2) { setBar((b) => (b ? null : b)); return; }
    const h = Math.max(28, Math.round(track * el.clientHeight / sh));
    const top = Math.round((el.scrollTop / (sh - el.clientHeight)) * (track - h));
    setBar((b) => (b && b.top === top && b.h === h ? b : { top, h }));
  }, []);
  useEffect(() => {
    recompute();
    const timers = [setTimeout(recompute, 200), setTimeout(recompute, 800), setTimeout(recompute, 2000)];
    window.addEventListener("resize", recompute);
    return () => { timers.forEach(clearTimeout); window.removeEventListener("resize", recompute); };
  }, [recompute]);
  const dragThumb = (e) => {
    e.preventDefault(); e.stopPropagation();
    const el = vpRef.current; const sy = e.clientY, s0 = el.scrollTop;
    const track = el.clientHeight, sh = el.scrollHeight, h = Math.max(28, track * el.clientHeight / sh);
    const move = (ev) => { el.scrollTop = s0 + (ev.clientY - sy) * (sh - el.clientHeight) / (track - h); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  let killerZone = null;
  for (const z of t.zones) if ((((layout && layout.zones) || {})[z] || []).includes("__killer")) killerZone = z;
  if (!killerZone) {
    return <div className="mx-auto max-w-3xl px-4 pb-28 pt-4 md:pb-10 md:pt-20">{children}</div>;
  }
  const areas = t.gridTemplateAreas.replace(/[a-z]/g, (ch) => (ch === killerZone ? "kilr" : "cont"));
  return (
    <div className="rs-outer w-full" style={{ height: "100dvh", paddingTop: "5rem", paddingBottom: "2.5rem", boxSizing: "border-box" }}>
      <div className="rs-grid" style={{ display: "grid", gap: 16, height: "100%", maxWidth: 1360, margin: "0 auto", boxSizing: "border-box", gridTemplateColumns: t.gridTemplateColumns, gridTemplateRows: t.gridTemplateRows, gridTemplateAreas: areas }}>
        <div className="rs-contcell" style={{ gridArea: "cont", minWidth: 0, minHeight: 0, position: "relative", paddingRight: 14 }}>
          <div ref={vpRef} onScroll={recompute} className="rs-hidebar" style={{ height: "100%", overflowY: "auto", overscrollBehavior: "contain", borderRadius: 24, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>{children}</div>
          {bar && <div onPointerDown={dragThumb} className="rs-thumb" title="拖动滚动" style={{ position: "absolute", top: bar.top, right: 3, height: bar.h }} />}
        </div>
        <div className="rs-killercell" style={{ gridArea: "kilr", minWidth: 0, minHeight: 0 }}>
          {S.isDesktop && (
            <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-[#e4d5af] bg-[#e9dcb6]/95 px-3 pb-3 pt-3 shadow-xl shadow-[#3d2b10]/10"><KillerChat /></div>
          )}
        </div>
      </div>
      <style>{`
        .rs-hidebar{ scrollbar-width:none; -ms-overflow-style:none; }
        .rs-hidebar::-webkit-scrollbar{ display:none; width:0; height:0; }
        .rs-thumb{ width:7px; border-radius:9999px; cursor:grab; background:rgba(61,43,16,.45); transition:background .15s ease, width .12s ease; }
        .rs-thumb:hover{ background:#efe3c4; width:9px; }
        @media (max-width: 767px){
          .rs-outer{ height:auto !important; padding-top:1rem !important; padding-bottom:7rem !important; }
          .rs-grid{ display:block !important; height:auto !important; max-width:100% !important; }
          .rs-killercell{ display:none !important; }
          .rs-contcell{ padding-right:0 !important; }
          .rs-hidebar{ height:auto !important; overflow:visible !important; border-radius:0 !important; }
          .rs-thumb{ display:none !important; }
        }
      `}</style>
    </div>
  );
}
