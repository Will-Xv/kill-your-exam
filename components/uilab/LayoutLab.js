"use client";
import { createContext, useContext, useRef, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import * as lab from "@/lib/uilab/store";

const Canvas = createContext(null);

export function LayoutLab({ enabled, children }) {
  const canvasRef = useRef(null);
  const S = lab.useUiLab();

  useEffect(() => { lab.initClient(); }, []);
  useEffect(() => { lab.setEnabled(enabled); }, [enabled]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => lab.setDesktop(mq.matches); on();
    try { mq.addEventListener("change", on); } catch { mq.addListener(on); }
    return () => { try { mq.removeEventListener("change", on); } catch { mq.removeListener(on); } };
  }, []);
  useEffect(() => () => lab.exitEdit(), []); // 离开首页时退出编辑

  const layout = lab.layoutNow();
  const editing = S.editing && enabled && S.isDesktop;
  const flow = !layout;

  // 编辑/套用时块是绝对定位,给画布一个高度
  useLayoutEffect(() => {
    const c = canvasRef.current; if (!c) return;
    if (flow) { c.style.minHeight = ""; return; }
    let maxB = 0;
    c.querySelectorAll("[data-lab]").forEach((el) => { const b = el.offsetTop + el.offsetHeight; if (b > maxB) maxB = b; });
    c.style.minHeight = Math.ceil(maxB) + 48 + "px";
  });

  return (
    <Canvas.Provider value={{ enabled, editing, layout, canvasRef }}>
      <div ref={canvasRef} className={editing ? "lab-canvas lab-on" : "lab-canvas"} style={{ position: "relative" }}>
        {children}
      </div>
      {enabled && S.isDesktop && typeof document !== "undefined" && createPortal(<Toolbar S={S} />, document.body)}
      <style>{`
        .lab-on [data-lab]{ outline:1.5px dashed rgba(158,20,12,.55); outline-offset:2px; border-radius:14px; }
        .lab-grip{ position:absolute; background:#9e140c; border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,.35); z-index:20; }
        .lab-move{ position:absolute; inset:0; z-index:10; cursor:move; }
      `}</style>
    </Canvas.Provider>
  );
}

export function Editable({ id, children }) {
  const ctx = useContext(Canvas);
  const ref = useRef(null);
  const { enabled, editing, layout, canvasRef } = ctx || {};
  const p = layout && layout[id];

  useLayoutEffect(() => {
    if (!editing || !canvasRef?.current || !ref.current || p) return;
    const cr = canvasRef.current.getBoundingClientRect();
    const r = ref.current.getBoundingClientRect();
    lab.seed(id, { x: Math.round(r.left - cr.left), y: Math.round(r.top - cr.top), w: Math.round(r.width), s: 1 });
  });

  if (!ctx || !enabled || !p) return <div ref={ref} data-labw>{children}</div>;

  const s = p.s || 1;
  const style = { position: "absolute", left: p.x, top: p.y, width: p.w, transform: `scale(${s})`, transformOrigin: "top left", zIndex: editing ? 2 : 1 };

  const drag = (onMove) => (e) => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, p0 = { ...p }; lab.pushHistory();
    const mv = (ev) => onMove(ev.clientX - sx, ev.clientY - sy, p0);
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  const onMove = drag((dx, dy, p0) => lab.setPos(id, { x: Math.round(p0.x + dx), y: Math.round(p0.y + dy) }));
  const onRight = drag((dx, _dy, p0) => lab.setPos(id, { w: Math.max(120, Math.round(p0.w + dx / (p0.s || 1))) }));
  const onLeft = drag((dx, _dy, p0) => { const w = Math.max(120, Math.round(p0.w - dx / (p0.s || 1))); lab.setPos(id, { x: Math.round(p0.x + (p0.w - w)), w }); });
  const onScale = drag((dx, _dy, p0) => lab.setPos(id, { s: Math.max(0.35, Math.min(2.5, +((p0.s || 1) + dx / (p0.w || 300)).toFixed(3))) }));

  return (
    <div ref={ref} data-lab={id} style={style}>
      <div style={editing ? { pointerEvents: "none" } : undefined}>{children}</div>
      {editing && (
        <>
          <div className="lab-move" onPointerDown={onMove} />
          <div className="lab-grip" onPointerDown={onLeft} title="拖动改变宽度(左边)" style={{ top: "50%", left: -7, width: 12, height: 34, marginTop: -17, borderRadius: 6, cursor: "ew-resize" }} />
          <div className="lab-grip" onPointerDown={onRight} title="拖动改变宽度(右边)" style={{ top: "50%", right: -7, width: 12, height: 34, marginTop: -17, borderRadius: 6, cursor: "ew-resize" }} />
          <div className="lab-grip" onPointerDown={onScale} title="拖动缩放整体大小" style={{ bottom: -7, right: -7, width: 16, height: 16, borderRadius: 4, cursor: "nwse-resize" }} />
        </>
      )}
    </div>
  );
}

function Toolbar({ S }) {
  const active = lab.activePreset();
  const editing = S.editing;
  const [libOpen, setLibOpen] = useState(false);
  const btn = "rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40";
  const ghost = btn + " bg-white/70 text-[#3d2b10] ring-1 ring-[#e4d5af]";
  return (
    <div className="fixed bottom-6 left-5 z-[60] flex flex-col items-start gap-2">
      {libOpen && (
        <div className="w-64 rounded-2xl border border-[#e4d5af] bg-[#f6efdc] p-2 shadow-xl">
          <div className="px-1 pb-1 text-[11px] font-bold text-[#6b4a25]">布局库</div>
          {S.presets.length === 0 && <div className="px-1 py-2 text-xs text-[#9a824f]">还没有保存的布局。排好后点「另存为」。</div>}
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {S.presets.map((p) => (
              <div key={p.id} className={"flex items-center gap-1 rounded-lg px-2 py-1 text-xs " + (active && active.id === p.id ? "bg-[#2f2413] text-[#f6efdd]" : "bg-[#3d2b10]/[0.06] text-[#3d2b10]")}>
                <button className="flex-1 truncate text-left" title="套用到首页" onClick={() => { lab.applyPreset(p.id); setLibOpen(false); }}>{active && active.id === p.id ? "● " : ""}{p.name}</button>
                <button className="opacity-70 hover:opacity-100" title="删除" onClick={() => lab.deletePreset(p.id)}>🗑</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {!editing ? (
        <div className="flex items-center gap-2">
          <button className={btn + " bg-[#2f2413] text-[#f6efdd] shadow-lg hover:opacity-90"} onClick={() => lab.enterEdit()}>🎨 编辑布局</button>
          <button className={btn + " bg-[#f6efdc] text-[#3d2b10] ring-1 ring-[#e4d5af] hover:brightness-95"} onClick={() => setLibOpen((v) => !v)}>📚 布局库</button>
          {active && <button className={btn + " bg-[#f6efdc] text-[#9e140c] ring-1 ring-[#e4d5af] hover:brightness-95"} onClick={() => lab.revertActive()} title="回到原始首页">↩ 撤回</button>}
        </div>
      ) : (
        <div className="flex max-w-[92vw] flex-wrap items-center gap-1.5 rounded-2xl border border-[#e4d5af] bg-[#f6efdc] p-2 shadow-xl">
          <span className="px-1 text-[11px] text-[#8a6a2c]">拖动=移动 · 左右=改宽 · 右下角=缩放</span>
          <button className={ghost} disabled={!S.past.length} onClick={() => lab.undo()}>↶ 撤销</button>
          <button className={ghost} disabled={!S.future.length} onClick={() => lab.redo()}>↷ 重做</button>
          <button className={ghost} onClick={() => lab.resetNatural()} title="恢复到默认排版">⟲ 恢复默认</button>
          <button className={btn + " bg-[#2f2413] text-[#f6efdd]"} onClick={() => { const n = window.prompt("给这套布局起个名字:", active ? active.name : "我的布局"); if (n && n.trim()) lab.savePreset(n.trim()); }}>💾 另存为</button>
          {active && <button className={btn + " bg-[#3d2b10] text-[#f6efdd]"} onClick={() => lab.overwriteActive()} title={"覆盖保存到:" + active.name}>💾 覆盖「{active.name}」</button>}
          <button className={btn + " bg-[#f6efdc] text-[#3d2b10] ring-1 ring-[#e4d5af]"} onClick={() => lab.exitEdit()}>✓ 完成</button>
        </div>
      )}
    </div>
  );
}
