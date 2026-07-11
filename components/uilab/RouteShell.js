"use client";
import { TEMPLATES } from "@/lib/uilab/templates";
import { KillerSlot } from "@/lib/uilab/killerSlot";

// 非首页的"外壳":杀手固定在它在布局里的那一格(和首页同位置/大小),其余格子合并成一个内容区渲染当前页面。
export default function RouteShell({ layout, children }) {
  const t = TEMPLATES[layout && layout.template] || TEMPLATES.single;
  let killerZone = null;
  for (const z of t.zones) if ((((layout && layout.zones) || {})[z] || []).includes("__killer")) killerZone = z;
  if (!killerZone) {
    // 布局里杀手没有独立格子 → 退回普通页面(不加外壳)
    return <div className="mx-auto max-w-3xl px-4 pb-28 pt-4 md:pb-10 md:pt-20">{children}</div>;
  }
  const areas = t.gridTemplateAreas.replace(/[a-z]/g, (ch) => (ch === killerZone ? "kilr" : "cont"));
  return (
    <div className="w-full" style={{ height: "100dvh", paddingTop: "5rem", paddingBottom: "2.5rem", boxSizing: "border-box" }}>
      <div style={{ display: "grid", gap: 16, height: "100%", maxWidth: 1360, margin: "0 auto", boxSizing: "border-box", gridTemplateColumns: t.gridTemplateColumns, gridTemplateRows: t.gridTemplateRows, gridTemplateAreas: areas }}>
        <div style={{ gridArea: "cont", minWidth: 0, minHeight: 0, overflow: "hidden", borderRadius: 24 }}>
          <div className="nice-scroll" style={{ height: "100%", overflowY: "auto", overscrollBehavior: "contain" }}>
            <div className="mx-auto max-w-3xl px-4 pb-10 pt-2">{children}</div>
          </div>
        </div>
        <div style={{ gridArea: "kilr", minWidth: 0, minHeight: 0 }}>
          <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-[#e4d5af] bg-[#e9dcb6]/95 px-3 pb-3 pt-3 shadow-xl shadow-[#3d2b10]/10"><KillerSlot /></div>
        </div>
      </div>
    </div>
  );
}
