"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useT } from "@/components/I18n";

// 手写作答画板:支持触控笔(三星 S-Pen / Apple Pencil)、鼠标、连电脑的写字板;带橡皮擦、撤销、清空。
// 通过 ref 暴露 getImage():有内容时返回 {mime:"image/png", data:base64},空则 null。
const HandwritePad = forwardRef(function HandwritePad(_props, ref) {
  const t = useT();
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const penSeen = useRef(false);
  const undoStack = useRef([]);
  const dirty = useRef(false);
  const [tool, setTool] = useState("pen"); // pen | eraser

  function setup() {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const cssW = wrap.clientWidth, cssH = 340;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    canvas.style.width = cssW + "px"; canvas.style.height = cssH + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, cssW, cssH);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctxRef.current = ctx;
  }
  useEffect(() => { setup(); }, []); // eslint-disable-line

  function pos(e) { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function snapshot() { try { const c = canvasRef.current; undoStack.current.push(c.getContext("2d").getImageData(0, 0, c.width, c.height)); if (undoStack.current.length > 25) undoStack.current.shift(); } catch {} }

  function down(e) {
    if (e.pointerType === "pen") penSeen.current = true;
    if (e.pointerType === "touch" && penSeen.current) return; // 用过笔后忽略手指(防手掌误触)
    e.preventDefault();
    snapshot();
    drawing.current = true; last.current = pos(e);
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch {}
  }
  function move(e) {
    if (!drawing.current) return;
    if (e.pointerType === "touch" && penSeen.current) return;
    e.preventDefault();
    const ctx = ctxRef.current; const p = pos(e);
    const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
    if (tool === "eraser") { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 22; }
    else { ctx.strokeStyle = "#111111"; ctx.lineWidth = 1.2 + pressure * 3.2; }
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p; dirty.current = true;
  }
  function up() { drawing.current = false; last.current = null; }

  function undo() { const s = undoStack.current.pop(); if (s) { canvasRef.current.getContext("2d").putImageData(s, 0, 0); if (!undoStack.current.length) dirty.current = false; } }
  function clear() { const c = canvasRef.current, ctx = ctxRef.current; snapshot(); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.restore(); dirty.current = false; }

  useImperativeHandle(ref, () => ({
    getImage() {
      if (!dirty.current || !canvasRef.current) return null;
      try { const url = canvasRef.current.toDataURL("image/png"); return { name: "handwriting.png", mime: "image/png", data: url.split(",")[1] }; } catch { return null; }
    },
    isEmpty() { return !dirty.current; },
    reset() { clear(); undoStack.current = []; }
  }));

  return (
    <div ref={wrapRef} className="mt-2">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={() => setTool("pen")} className={`rounded-full border px-3 py-1 ${tool === "pen" ? "border-amber-500 bg-amber-50 text-amber-700 font-medium" : "border-slate-200 text-slate-500"}`}>✏️ {t("笔")}</button>
        <button type="button" onClick={() => setTool("eraser")} className={`rounded-full border px-3 py-1 ${tool === "eraser" ? "border-amber-500 bg-amber-50 text-amber-700 font-medium" : "border-slate-200 text-slate-500"}`}>🧽 {t("橡皮擦")}</button>
        <button type="button" onClick={undo} className="rounded-full border border-slate-200 px-3 py-1 text-slate-500">↺ {t("撤销")}</button>
        <button type="button" onClick={clear} className="rounded-full border border-slate-200 px-3 py-1 text-slate-500">🗑 {t("清空")}</button>
        <span className="text-xs text-slate-400">{t("可用触控笔/手写板/鼠标书写")}</span>
      </div>
      <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
        className="w-full rounded-xl border border-slate-300 bg-white" style={{ touchAction: "none" }} />
    </div>
  );
});
export default HandwritePad;
