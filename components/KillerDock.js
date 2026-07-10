"use client";
import KillerChat from "@/components/KillerChat";
import { useRef, useEffect, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import * as lab from "@/lib/uilab/store";
import { useT } from "@/components/I18n";

// 电脑端右侧悬浮聊天卡片。开发者在首页「编辑布局」时,这张卡片也能拖动/缩放(与首页共用一套布局)。
export default function KillerDock() {
  const t = useT();
  const S = lab.useUiLab();
  const ref = useRef(null);
  const onHome = usePathname() === "/"; // 自定义位置只在首页生效,其它页面杀手保持默认位置

  useEffect(() => {
    lab.initClient();
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => lab.setDesktop(mq.matches); on();
    try { mq.addEventListener("change", on); } catch { mq.addListener(on); }
    return () => { try { mq.removeEventListener("change", on); } catch { mq.removeListener(on); } };
  }, []);

  const layout = lab.layoutNow();
  const editing = S.editing && S.enabled && S.isDesktop && onHome;
  const p = onHome ? (layout && layout["__killer"]) : null;

  useLayoutEffect(() => {
    if (!editing || !ref.current || p) return;
    const r = ref.current.getBoundingClientRect();
    lab.seed("__killer", { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  });

  const base = "hidden md:flex flex-col overflow-hidden rounded-3xl border border-[#e4d5af] bg-[#f6efdc]/95 px-3 pb-3 pt-3 shadow-xl shadow-[#3d2b10]/10 backdrop-blur-xl";
  const posClass = p ? "fixed" : "fixed right-5 top-20 bottom-4 w-[440px] lg:w-[480px] z-30";
  const style = p ? { left: p.x, top: p.y, width: p.w, height: p.h, zIndex: editing ? 40 : 30 } : undefined;

  const drag = (fn) => (e) => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, p0 = { ...p }; lab.pushHistory();
    const mv = (ev) => fn(ev.clientX - sx, ev.clientY - sy, p0);
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  const mv = drag((dx, dy, p0) => lab.setPos("__killer", { x: Math.round(p0.x + dx), y: Math.round(p0.y + dy) }));
  const eR = drag((dx, _d, p0) => lab.setPos("__killer", { w: Math.max(240, Math.round(p0.w + dx)) }));
  const eB = drag((_d, dy, p0) => lab.setPos("__killer", { h: Math.max(220, Math.round(p0.h + dy)) }));
  const eL = drag((dx, _d, p0) => { const w = Math.max(240, Math.round(p0.w - dx)); lab.setPos("__killer", { x: Math.round(p0.x + (p0.w - w)), w }); });
  const eT = drag((_d, dy, p0) => { const h = Math.max(220, Math.round(p0.h - dy)); lab.setPos("__killer", { y: Math.round(p0.y + (p0.h - h)), h }); });
  const cBR = drag((dx, dy, p0) => lab.setPos("__killer", { w: Math.max(240, Math.round(p0.w + dx)), h: Math.max(220, Math.round(p0.h + dy)) }));

  const grip = { position: "absolute", background: "#9e140c", border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.35)", zIndex: 30 };

  return (
    <aside ref={ref} className={base + " " + posClass + (editing ? " outline outline-2 outline-dashed outline-[#9e140c]/70" : "")} style={style}>
      {editing ? <div style={{ pointerEvents: "none" }} className="flex min-h-0 flex-1 flex-col overflow-hidden"><KillerChat /></div> : <KillerChat />}
      {editing && (
        <>
          <div onPointerDown={mv} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 40, cursor: "move", zIndex: 25 }} title={t("拖动移动杀手卡片")} />
          <div onPointerDown={eL} style={{ ...grip, top: "50%", left: -7, width: 12, height: 40, marginTop: -20, borderRadius: 6, cursor: "ew-resize" }} title={t("改宽(左)")} />
          <div onPointerDown={eR} style={{ ...grip, top: "50%", right: -7, width: 12, height: 40, marginTop: -20, borderRadius: 6, cursor: "ew-resize" }} title={t("改宽(右)")} />
          <div onPointerDown={eT} style={{ ...grip, left: "50%", top: -7, width: 40, height: 12, marginLeft: -20, borderRadius: 6, cursor: "ns-resize" }} title={t("改高(上)")} />
          <div onPointerDown={eB} style={{ ...grip, left: "50%", bottom: -7, width: 40, height: 12, marginLeft: -20, borderRadius: 6, cursor: "ns-resize" }} title={t("改高(下)")} />
          <div onPointerDown={cBR} style={{ ...grip, right: -8, bottom: -8, width: 18, height: 18, borderRadius: 4, cursor: "nwse-resize" }} title={t("缩放")} />
          <div style={{ position: "absolute", top: 6, left: 10, zIndex: 26, pointerEvents: "none" }} className="rounded-full bg-[#9e140c] px-2 py-0.5 text-[10px] font-bold text-white">{t("杀手 · 可拖动")}</div>
        </>
      )}
    </aside>
  );
}
