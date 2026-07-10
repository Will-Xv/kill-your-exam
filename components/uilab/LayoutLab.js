"use client";
import { createContext, useContext, useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// 首页布局实验室(仅开发者、纯前端、与砖头/AI 完全隔离)
// 思路:把首页现有的每个块用 <Editable id> 包起来。平时按自然流排版;
// 开发者进入「编辑」后,块变成绝对定位,可拖动(移动)、拉右边(改宽)、拉右下角(缩放)。
// 因为定位/缩放作用在【真实元素】上,按钮的点击识别区天然跟随移动与缩放。
// 布局存在本地(localStorage),可命名保存多套、随时套用、一键撤回到原始首页。
// ─────────────────────────────────────────────────────────────────────────────

const LabCtx = createContext(null);
const LS_KEY = "kye.uilab.v1";

function loadStore() {
  if (typeof window === "undefined") return { activeId: null, presets: [] };
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "") || { activeId: null, presets: [] }; }
  catch { return { activeId: null, presets: [] }; }
}
function persist(s) { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {} }
const clone = (o) => JSON.parse(JSON.stringify(o || {}));

export function LayoutLab({ enabled, children }) {
  const canvasRef = useRef(null);
  const regs = useRef({});          // id -> ref object (has .current = DOM node)
  const [store, setStore] = useState(() => (enabled ? loadStore() : { activeId: null, presets: [] }));
  const [editing, setEditing] = useState(false);
  const [pos, setPos] = useState(null);       // working positions while editing {id:{x,y,w,s}}
  const [past, setPast] = useState([]);       // undo stack
  const [futur, setFutur] = useState([]);     // redo stack
  const [canvasH, setCanvasH] = useState(0);
  const [libOpen, setLibOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => setIsDesktop(mq.matches); on();
    try { mq.addEventListener("change", on); } catch { mq.addListener(on); }
    return () => { try { mq.removeEventListener("change", on); } catch { mq.removeListener(on); } };
  }, []);

  const activePreset = store.presets.find((p) => p.id === store.activeId) || null;
  const appliedPos = !editing && enabled && isDesktop && activePreset ? activePreset.layout : null;
  const mode = editing ? "edit" : (appliedPos ? "applied" : "flow");
  const positions = editing ? pos : appliedPos;

  const register = useCallback((id, ref) => { regs.current[id] = ref; return () => { if (regs.current[id] === ref) delete regs.current[id]; }; }, []);

  const measureAll = useCallback(() => {
    const c = canvasRef.current; if (!c) return {};
    const cr = c.getBoundingClientRect();
    const out = {};
    for (const id in regs.current) {
      const el = regs.current[id] && regs.current[id].current; if (!el) continue;
      const r = el.getBoundingClientRect();
      out[id] = { x: Math.round(r.left - cr.left), y: Math.round(r.top - cr.top), w: Math.round(r.width), s: 1 };
    }
    return out;
  }, []);

  function enterEdit() {
    const measured = measureAll();
    const base = appliedPos ? clone(appliedPos) : {};
    const merged = {};
    for (const id in measured) merged[id] = base[id] ? { ...measured[id], ...base[id] } : measured[id];
    setPos(merged); setPast([]); setFutur([]); setEditing(true);
  }

  // gesture helpers — caller snapshots history once at pointerdown
  const snapshot = useCallback(() => { setPast((h) => [...h.slice(-59), clone(pos)]); setFutur([]); }, [pos]);
  const patch = useCallback((id, p) => setPos((cur) => ({ ...cur, [id]: { ...cur[id], ...p } })), []);

  function undo() { setPast((h) => { if (!h.length) return h; setFutur((f) => [clone(pos), ...f]); setPos(h[h.length - 1]); return h.slice(0, -1); }); }
  function redo() { setFutur((f) => { if (!f.length) return f; setPast((h) => [...h, clone(pos)]); setPos(f[0]); return f.slice(1); }); }

  function resetToNatural() { setPast((h) => [...h, clone(pos)]); setFutur([]); setPos(measureAll()); }

  function revertActive() { // 撤回:首页回到原始自然布局
    setStore((s) => { const ns = { ...s, activeId: null }; persist(ns); return ns; });
    setLibOpen(false);
  }

  function savePreset() {
    const cur = pos || appliedPos || {};
    const name = (typeof window !== "undefined" && window.prompt("给这套布局起个名字:", activePreset ? activePreset.name : "我的布局")) || "";
    if (!name.trim()) return;
    const id = "L" + Date.now().toString(36);
    setStore((s) => { const ns = { activeId: id, presets: [...s.presets, { id, name: name.trim(), ts: Date.now(), layout: clone(cur) }] }; persist(ns); return ns; });
  }
  function overwriteActive() {
    if (!activePreset) return savePreset();
    setStore((s) => { const presets = s.presets.map((p) => p.id === activePreset.id ? { ...p, layout: clone(pos), ts: Date.now() } : p); const ns = { ...s, presets }; persist(ns); return ns; });
  }
  function applyPreset(id) { setStore((s) => { const ns = { ...s, activeId: id }; persist(ns); return ns; }); setEditing(false); setLibOpen(false); }
  function deletePreset(id) { setStore((s) => { const presets = s.presets.filter((p) => p.id !== id); const ns = { activeId: s.activeId === id ? null : s.activeId, presets }; persist(ns); return ns; }); }

  useLayoutEffect(() => {
    if (mode === "flow" || !positions) { if (canvasH) setCanvasH(0); return; }
    let maxB = 0;
    for (const id in positions) {
      const el = regs.current[id] && regs.current[id].current; const p = positions[id];
      const h = el ? el.getBoundingClientRect().height : 0;
      maxB = Math.max(maxB, (p.y || 0) + h);
    }
    setCanvasH(Math.ceil(maxB) + 48);
  }, [mode, positions, editing]); // eslint-disable-line

  const ctx = { enabled, editing, mode, positions, register, snapshot, patch, canvasRef };
  const canvasStyle = mode === "flow" ? { position: "relative" } : { position: "relative", height: canvasH || undefined, minHeight: canvasH || undefined };

  return (
    <LabCtx.Provider value={ctx}>
      <div ref={canvasRef} style={canvasStyle} className={editing ? "lab-canvas lab-on" : "lab-canvas"}>
        {children}
      </div>
      {enabled && isDesktop && (
        <Toolbar
          editing={editing} mode={mode} activePreset={activePreset} presets={store.presets}
          canUndo={past.length > 0} canRedo={futur.length > 0} libOpen={libOpen} setLibOpen={setLibOpen}
          onEnter={enterEdit} onExit={() => setEditing(false)} onUndo={undo} onRedo={redo}
          onReset={resetToNatural} onSave={savePreset} onOverwrite={overwriteActive}
          onRevert={revertActive} onApply={applyPreset} onDelete={deletePreset}
        />
      )}
      <style>{`
        .lab-on [data-lab]{ outline:1.5px dashed rgba(158,20,12,.55); outline-offset:2px; border-radius:14px; }
        .lab-grip{ position:absolute; background:#9e140c; border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,.35); z-index:20; }
        .lab-move{ position:absolute; inset:0; z-index:10; cursor:move; }
      `}</style>
    </LabCtx.Provider>
  );
}

export function Editable({ id, children }) {
  const ctx = useContext(LabCtx);
  const ref = useRef(null);
  useEffect(() => (ctx ? ctx.register(id, ref) : undefined), [id]); // eslint-disable-line

  if (!ctx || !ctx.enabled) return <div ref={ref} data-labw>{children}</div>;
  const { mode, positions, editing, snapshot, patch, canvasRef } = ctx;
  const p = positions && positions[id];

  if (mode === "flow" || !p) return <div ref={ref} data-labw>{children}</div>;

  const style = { position: "absolute", left: p.x, top: p.y, width: p.w, transform: `scale(${p.s || 1})`, transformOrigin: "top left", zIndex: editing ? 2 : 1 };

  function startMove(e) {
    if (!editing) return; e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, p0 = { ...p }; snapshot();
    const mv = (ev) => patch(id, { x: Math.round(p0.x + (ev.clientX - sx)), y: Math.round(p0.y + (ev.clientY - sy)) });
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  }
  function startWidth(e) {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, w0 = p.w, s = p.s || 1; snapshot();
    const mv = (ev) => patch(id, { w: Math.max(120, Math.round(w0 + (ev.clientX - sx) / s)) });
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  }
  function startScale(e) {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, s0 = p.s || 1, w = p.w; snapshot();
    const mv = (ev) => patch(id, { s: Math.max(0.35, Math.min(2.5, +(s0 + (ev.clientX - sx) / (w || 300)).toFixed(3))) });
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  }

  return (
    <div ref={ref} data-lab={id} style={style}>
      <div style={editing ? { pointerEvents: "none" } : undefined}>{children}</div>
      {editing && (
        <>
          <div className="lab-move" onPointerDown={startMove} />
          {/* 右边:改宽 */}
          <div className="lab-grip" onPointerDown={startWidth} title="拖动改变宽度"
               style={{ top: "50%", right: -7, width: 12, height: 34, marginTop: -17, borderRadius: 6, cursor: "ew-resize" }} />
          {/* 右下角:整体缩放 */}
          <div className="lab-grip" onPointerDown={startScale} title="拖动缩放整体大小"
               style={{ bottom: -7, right: -7, width: 16, height: 16, borderRadius: 4, cursor: "nwse-resize" }} />
        </>
      )}
    </div>
  );
}

function Toolbar(props) {
  const { editing, activePreset, presets, canUndo, canRedo, libOpen, setLibOpen,
          onEnter, onExit, onUndo, onRedo, onReset, onSave, onOverwrite, onRevert, onApply, onDelete } = props;
  const btn = "rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40";
  return (
    <div className="fixed bottom-6 left-5 z-40 flex flex-col items-start gap-2">
      {libOpen && (
        <div className="w-64 rounded-2xl border border-[#e4d5af] bg-[#f6efdc] p-2 shadow-xl">
          <div className="px-1 pb-1 text-[11px] font-bold text-[#6b4a25]">布局库</div>
          {presets.length === 0 && <div className="px-1 py-2 text-xs text-[#9a824f]">还没有保存的布局。排好后点「保存」。</div>}
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {presets.map((p) => (
              <div key={p.id} className={"flex items-center gap-1 rounded-lg px-2 py-1 text-xs " + (activePreset && activePreset.id === p.id ? "bg-[#2f2413] text-[#f6efdd]" : "bg-[#3d2b10]/[0.06] text-[#3d2b10]")}>
                <button className="flex-1 truncate text-left" title="套用到首页" onClick={() => onApply(p.id)}>{activePreset && activePreset.id === p.id ? "● " : ""}{p.name}</button>
                <button className="opacity-70 hover:opacity-100" title="删除" onClick={() => onDelete(p.id)}>🗑</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {!editing ? (
        <div className="flex items-center gap-2">
          <button className={btn + " bg-[#2f2413] text-[#f6efdd] shadow-lg hover:opacity-90"} onClick={onEnter}>🎨 编辑布局</button>
          <button className={btn + " bg-[#f6efdc] text-[#3d2b10] ring-1 ring-[#e4d5af] hover:brightness-95"} onClick={() => setLibOpen((v) => !v)}>📚 布局库</button>
          {activePreset && <button className={btn + " bg-[#f6efdc] text-[#9e140c] ring-1 ring-[#e4d5af] hover:brightness-95"} onClick={onRevert} title="回到原始首页">↩ 撤回</button>}
        </div>
      ) : (
        <div className="flex max-w-[92vw] flex-wrap items-center gap-1.5 rounded-2xl border border-[#e4d5af] bg-[#f6efdc] p-2 shadow-xl">
          <span className="px-1 text-[11px] text-[#8a6a2c]">拖动=移动 · 右边=改宽 · 右下角=缩放</span>
          <button className={btn + " bg-white/70 text-[#3d2b10] ring-1 ring-[#e4d5af]"} disabled={!canUndo} onClick={onUndo}>↶ 撤销</button>
          <button className={btn + " bg-white/70 text-[#3d2b10] ring-1 ring-[#e4d5af]"} disabled={!canRedo} onClick={onRedo}>↷ 重做</button>
          <button className={btn + " bg-white/70 text-[#3d2b10] ring-1 ring-[#e4d5af]"} onClick={onReset} title="恢复到默认排版">⟲ 恢复默认</button>
          <button className={btn + " bg-[#2f2413] text-[#f6efdd]"} onClick={onSave}>💾 另存为</button>
          {activePreset && <button className={btn + " bg-[#3d2b10] text-[#f6efdd]"} onClick={onOverwrite} title={"覆盖保存到:" + activePreset.name}>💾 覆盖「{activePreset.name}」</button>}
          <button className={btn + " bg-[#f6efdc] text-[#3d2b10] ring-1 ring-[#e4d5af]"} onClick={onExit}>✓ 完成</button>
        </div>
      )}
    </div>
  );
}
