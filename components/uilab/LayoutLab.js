"use client";
import { createContext, useContext, useRef, useEffect, useLayoutEffect, useState, Children } from "react";
import { createPortal } from "react-dom";
import * as lab from "@/lib/uilab/store";
import { collectRects, snapMove, snapEdgeX } from "@/lib/uilab/snap";
import { useT } from "@/components/I18n";

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

  function enterEditMeasured() {
    const c = canvasRef.current;
    if (!c) { lab.enterEdit({}); return; }
    const cr = c.getBoundingClientRect();
    const seeds = {};
    document.querySelectorAll("[data-lab-id]").forEach((el) => {
      const id = el.getAttribute("data-lab-id");
      const r = el.getBoundingClientRect();
      // x 用视口坐标(切到全宽后画布左缘≈视口 0),y 用相对画布 —— 于是进入编辑后各块停在原位、不跳动
      seeds[id] = { x: Math.round(r.left), y: Math.round(r.top - cr.top), w: Math.round(r.width), s: 1 };
    });
    lab.enterEdit(seeds);
  }

  const layout = lab.layoutNow();
  const editing = S.editing && enabled && S.isDesktop;
  const flow = !layout;
  // 全宽画布:开发者编辑中或已套用布局时,画布占满全宽(AppShell 已撤掉右侧预留),
  // 块可放到任意位置(含杀手下方/任意处);未启用时保持原来的居中窄栏。
  const fullWidth = enabled && S.isDesktop && (S.editing || !!lab.activePreset());

  // 编辑/套用时块是绝对定位,给画布一个高度
  useLayoutEffect(() => {
    const c = canvasRef.current; if (!c) return;
    if (flow) { c.style.minHeight = ""; return; }
    let maxB = 0;
    c.querySelectorAll("[data-lab]").forEach((el) => { const b = el.offsetTop + el.offsetHeight; if (b > maxB) maxB = b; });
    c.style.minHeight = Math.ceil(maxB) + 48 + "px";
  });

  // 进入编辑(或恢复默认)时,一次性测量所有还在自然流里的块,再统一转绝对定位 ——
  // 避免逐个转绝对导致后面的块因前面的块脱离文档流而向上错位。
  useLayoutEffect(() => {
    if (!editing) return;
    const c = canvasRef.current; if (!c) return;
    const nodes = document.querySelectorAll("[data-lab-id]"); // 仅"尚未定位"的自然流块带此属性(可能在画布外的溢出区)
    if (!nodes.length) return;
    const cr = c.getBoundingClientRect();
    const seeds = {};
    nodes.forEach((el) => { const id = el.getAttribute("data-lab-id"); const r = el.getBoundingClientRect(); seeds[id] = { x: Math.round(r.left - cr.left), y: Math.round(r.top - cr.top), w: Math.round(r.width), s: 1 }; });
    lab.seedMany(seeds);
  });

  // 布局里没有位置的块(例如某门考试才出现的提醒卡),不塞进绝对定位画布(会漂到顶上重叠),
  // 而是排到画布下方的正常文档流里;编辑时它们会被测量并接着安置。
  const positioning = !!layout;
  const arr = Children.toArray(children);
  const isOrphan = (ch) => positioning && ch && ch.props && ch.props.id && !(layout && layout[ch.props.id]);
  const canvasKids = positioning ? arr.filter((ch) => !isOrphan(ch)) : arr;
  const orphanKids = positioning ? arr.filter(isOrphan) : [];

  return (
    <Canvas.Provider value={{ enabled, editing, layout, canvasRef }}>
      <div ref={canvasRef} className={editing ? "lab-canvas lab-on" : "lab-canvas"} style={{ position: "relative", width: "100%" }}>
        <div className={fullWidth ? "mx-auto max-w-3xl px-4" : ""}>{canvasKids}</div>
      </div>
      {orphanKids.length > 0 && <div className="mx-auto max-w-3xl space-y-4 px-4 pb-10">{orphanKids}</div>}
      {enabled && S.isDesktop && typeof document !== "undefined" && createPortal(<Toolbar S={S} onEnter={enterEditMeasured} />, document.body)}
      {editing && typeof document !== "undefined" && createPortal(<Guides guides={S.guides} />, document.body)}
      <style>{`
        .lab-on [data-lab]{ outline:1.5px dashed rgba(158,20,12,.55); outline-offset:2px; border-radius:14px; }
        .lab-grip{ position:absolute; background:#9e140c; border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,.35); z-index:20; }
        .lab-move{ position:absolute; inset:0; z-index:10; cursor:move; }
      `}</style>
    </Canvas.Provider>
  );
}

export function Editable({ id, children }) {
  const t = useT();
  const ctx = useContext(Canvas);
  const ref = useRef(null);
  const { enabled, editing, layout, canvasRef } = ctx || {};
  const p = layout && layout[id];

  if (!ctx || !p) return <div ref={ref} data-labw data-lab-id={id}>{children}</div>;

  const s = p.s || 1;
  const style = { position: "absolute", left: p.x, top: p.y, width: p.w, transform: `scale(${s})`, transformOrigin: "top left", zIndex: editing ? 2 : 1 };

  const gestureBase = () => { const start = ref.current.getBoundingClientRect(); const others = collectRects(ref.current); lab.pushHistory(); return { start, others }; };
  function onMove(e) {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, p0 = { ...p }; const { start, others } = gestureBase();
    const mv = (ev) => { const { dx, dy, guides } = snapMove(start, ev.clientX - sx, ev.clientY - sy, others); lab.setPos(id, { x: Math.round(p0.x + dx), y: Math.round(p0.y + dy) }); lab.setGuides(guides); };
    const up = () => { lab.setGuides([]); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  }
  function onRight(e) {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, s = p.s || 1; const { start, others } = gestureBase();
    const mv = (ev) => { const { value, guide } = snapEdgeX(start.right + (ev.clientX - sx), others); const w = Math.max(120, Math.round((value - start.left) / s)); lab.setPos(id, { w }); lab.setGuides(guide ? [guide] : []); };
    const up = () => { lab.setGuides([]); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  }
  function onLeft(e) {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, s = p.s || 1, p0 = { ...p }; const { start, others } = gestureBase();
    const mv = (ev) => { const { value, guide } = snapEdgeX(start.left + (ev.clientX - sx), others); const w = Math.max(120, Math.round((start.right - value) / s)); lab.setPos(id, { x: Math.round(p0.x + (value - start.left)), w }); lab.setGuides(guide ? [guide] : []); };
    const up = () => { lab.setGuides([]); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  }
  function onScale(e) {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, p0 = { ...p }; lab.pushHistory();
    const mv = (ev) => lab.setPos(id, { s: Math.max(0.35, Math.min(2.5, +((p0.s || 1) + (ev.clientX - sx) / (p0.w || 300)).toFixed(3))) });
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  }

  return (
    <div ref={ref} data-lab={id} data-snap style={style}>
      <div style={editing ? { pointerEvents: "none" } : undefined}>{children}</div>
      {editing && (
        <>
          <div className="lab-move" onPointerDown={onMove} />
          <div className="lab-grip" onPointerDown={onLeft} title={t("拖动改变宽度(左边)")} style={{ top: "50%", left: -7, width: 12, height: 34, marginTop: -17, borderRadius: 6, cursor: "ew-resize" }} />
          <div className="lab-grip" onPointerDown={onRight} title={t("拖动改变宽度(右边)")} style={{ top: "50%", right: -7, width: 12, height: 34, marginTop: -17, borderRadius: 6, cursor: "ew-resize" }} />
          <div className="lab-grip" onPointerDown={onScale} title={t("拖动缩放整体大小")} style={{ bottom: -7, right: -7, width: 16, height: 16, borderRadius: 4, cursor: "nwse-resize" }} />
        </>
      )}
    </div>
  );
}

function Guides({ guides }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, pointerEvents: "none" }}>
      {guides.map((g, i) => g.x != null
        ? <div key={i} style={{ position: "absolute", left: g.x, top: 0, bottom: 0, width: 1, background: "#2563eb", boxShadow: "0 0 0 0.5px rgba(37,99,235,.5)" }} />
        : <div key={i} style={{ position: "absolute", top: g.y, left: 0, right: 0, height: 1, background: "#2563eb", boxShadow: "0 0 0 0.5px rgba(37,99,235,.5)" }} />)}
    </div>
  );
}

function Toolbar({ S, onEnter }) {
  const t = useT();
  const active = lab.activePreset();
  const editing = S.editing;
  const [libOpen, setLibOpen] = useState(false);
  const btn = "rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40";
  const ghost = btn + " bg-white/70 text-[#3d2b10] ring-1 ring-[#e4d5af]";
  return (
    <div className="fixed bottom-6 left-5 z-[60] flex flex-col items-start gap-2">
      {libOpen && (
        <div className="w-64 rounded-2xl border border-[#e4d5af] bg-[#f6efdc] p-2 shadow-xl">
          <div className="px-1 pb-1 text-[11px] font-bold text-[#6b4a25]">{t("布局库")}</div>
          {S.presets.length === 0 && <div className="px-1 py-2 text-xs text-[#9a824f]">{t("还没有保存的布局。排好后点「另存为」。")}</div>}
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {S.presets.map((p) => (
              <div key={p.id} className={"flex items-center gap-1 rounded-lg px-2 py-1 text-xs " + (active && active.id === p.id ? "bg-[#2f2413] text-[#f6efdd]" : "bg-[#3d2b10]/[0.06] text-[#3d2b10]")}>
                <button className="flex-1 truncate text-left" title={t("套用到首页")} onClick={() => { lab.applyPreset(p.id); setLibOpen(false); }}>{active && active.id === p.id ? "● " : ""}{p.name}</button>
                <button className="opacity-70 hover:opacity-100" title={t("删除")} onClick={() => lab.deletePreset(p.id)}>🗑</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {!editing ? (
        <div className="flex items-center gap-2">
          <button className={btn + " bg-[#2f2413] text-[#f6efdd] shadow-lg hover:opacity-90"} onClick={onEnter}>🎨 {t("编辑布局")}</button>
          <button className={btn + " bg-[#f6efdc] text-[#3d2b10] ring-1 ring-[#e4d5af] hover:brightness-95"} onClick={() => setLibOpen((v) => !v)}>📚 {t("布局库")}</button>
          {active && <button className={btn + " bg-[#f6efdc] text-[#9e140c] ring-1 ring-[#e4d5af] hover:brightness-95"} onClick={() => lab.revertActive()} title={t("回到原始首页")}>↩ {t("撤回")}</button>}
          {!active && S.lastReverted && S.presets.some((p) => p.id === S.lastReverted) && <button className={btn + " bg-[#f6efdc] text-[#3d2b10] ring-1 ring-[#e4d5af] hover:brightness-95"} onClick={() => lab.reapplyReverted()} title={t("重新套用刚撤回的布局")}>↪ {t("恢复布局")}</button>}
          {active && <button className={btn + " bg-[#9e140c] text-white hover:opacity-90"} onClick={() => { if (window.confirm(t("发布为默认后,所有用户的首页都会用这套布局。确定发布?"))) lab.publishDefault(); }}>🌐 {t("发布为默认")}</button>}
          {S.publishedDefault && <button className={btn + " bg-[#f6efdc] text-[#9e140c] ring-1 ring-[#e4d5af] hover:brightness-95"} onClick={() => { if (window.confirm(t("取消发布默认布局?所有用户会恢复原始首页。"))) lab.unpublishDefault(); }}>{t("取消发布")}</button>}
        </div>
      ) : (
        <div className="flex max-w-[92vw] flex-wrap items-center gap-1.5 rounded-2xl border border-[#e4d5af] bg-[#f6efdc] p-2 shadow-xl">
          <span className="px-1 text-[11px] text-[#8a6a2c]">{t("拖动=移动 · 左右=改宽 · 右下角=缩放")}</span>
          <button className={ghost} disabled={!S.past.length} onClick={() => lab.undo()}>↶ {t("撤销")}</button>
          <button className={ghost} disabled={!S.future.length} onClick={() => lab.redo()}>↷ {t("重做")}</button>
          <button className={ghost} onClick={() => lab.resetNatural()} title={t("恢复到默认排版")}>⟲ {t("恢复默认")}</button>
          <button className={btn + " bg-[#2f2413] text-[#f6efdd]"} onClick={() => { const n = window.prompt(t("给这套布局起个名字:"), active ? active.name : t("我的布局")); if (n && n.trim()) lab.savePreset(n.trim()); }}>💾 {t("另存为")}</button>
          {active && <button className={btn + " bg-[#3d2b10] text-[#f6efdd]"} onClick={() => lab.overwriteActive()} title={t("覆盖保存到:") + active.name}>💾 {t("覆盖")}「{active.name}」</button>}
          <button className={btn + " bg-[#f6efdc] text-[#3d2b10] ring-1 ring-[#e4d5af]"} onClick={() => lab.exitEdit()}>✓ {t("完成")}</button>
          <button className={btn + " bg-[#9e140c] text-white hover:opacity-90"} onClick={() => { if (window.confirm(t("发布为默认后,所有用户的首页都会用这套布局。确定发布?"))) lab.publishDefault(); }}>🌐 {t("发布为默认")}</button>
        </div>
      )}
    </div>
  );
}
