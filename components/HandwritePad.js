"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useT } from "@/components/I18n";

// 手写作答画板:支持触控笔(三星 S-Pen / Apple Pencil)、鼠标、连电脑的写字板;带橡皮擦、撤销、清空。
// 通过 ref 暴露 getImage():有内容时返回 {mime:"image/png", data:base64},空则 null。
const HandwritePad = forwardRef(function HandwritePad({ initial, onChange }, ref) {
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
  const [fingerScroll, setFingerScroll] = useState(() => { if (typeof window === "undefined") return false; try { return localStorage.getItem("kye_finger_scroll") === "1"; } catch { return false; } }); // 手指用于滚动/缩放(只用笔书写);跨题跨考试记住

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
    if (initial) { const im = new Image(); im.onload = () => { try { ctx.drawImage(im, 0, 0, cssW, cssH); dirty.current = true; } catch {} }; im.src = initial; }
  }
  useEffect(() => { setup(); }, []); // eslint-disable-line
  useEffect(() => { try { localStorage.setItem("kye_finger_scroll", fingerScroll ? "1" : "0"); } catch {} }, [fingerScroll]);

  function pos(e) { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  // 笔悬停/落笔时把画布 touch-action 临时设为 none(笔一定用于书写,不会被浏览器当成平移/滚动);笔离开再恢复
  function penForceDraw() { const c = canvasRef.current; if (c) c.style.touchAction = "none"; }
  function restoreTouch() { const c = canvasRef.current; if (c) c.style.touchAction = fingerScroll ? "manipulation" : "none"; }
  function snapshot() { try { const c = canvasRef.current; undoStack.current.push(c.getContext("2d").getImageData(0, 0, c.width, c.height)); if (undoStack.current.length > 25) undoStack.current.shift(); } catch {} }

  function down(e) {
    if (e.pointerType === "pen") { penSeen.current = true; penForceDraw(); if (!fingerScroll) setFingerScroll(true); } // 一旦用笔,手指自动改为滚动页面
    if (e.pointerType === "touch" && (fingerScroll || penSeen.current)) return; // 手指用于滚动/防手掌误触,不当作书写
    e.preventDefault();
    snapshot();
    drawing.current = true; last.current = pos(e);
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch {}
  }
  function move(e) {
    if (e.pointerType === "pen") penForceDraw(); // 笔悬停移动时也保持可书写
    if (!drawing.current) return;
    if (e.pointerType === "touch" && (fingerScroll || penSeen.current)) return;
    e.preventDefault();
    const ctx = ctxRef.current; const p = pos(e);
    const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
    if (tool === "eraser") { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 22; }
    else { ctx.strokeStyle = "#111111"; ctx.lineWidth = 1.2 + pressure * 3.2; }
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p; dirty.current = true;
  }
  function emit() { try { if (onChange && canvasRef.current) onChange(dirty.current ? canvasRef.current.toDataURL("image/png") : ""); } catch {} }
  function hover(e) { if (e.pointerType === "pen") penForceDraw(); } // 笔悬停进入 -> 立刻可书写
  function leave() { restoreTouch(); up(); } // 笔/手指离开 -> 恢复该模式的手势
  function up() { drawing.current = false; last.current = null; emit(); }

  function undo() { const s = undoStack.current.pop(); if (s) { canvasRef.current.getContext("2d").putImageData(s, 0, 0); if (!undoStack.current.length) dirty.current = false; emit(); } }
  function clear() { const c = canvasRef.current, ctx = ctxRef.current; snapshot(); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.restore(); dirty.current = false; emit(); }

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
        <button type="button" onClick={() => setFingerScroll((v) => !v)} title={t("切换:手指是用来书写,还是用来滑动页面(用笔时建议选滑动)")} className={`rounded-full border px-3 py-1 ${fingerScroll ? "border-amber-500 bg-amber-50 text-amber-700 font-medium" : "border-slate-200 text-slate-500"}`}>{fingerScroll ? t("✋ 手指滑动") : t("✍️ 手指书写")}</button>
        <span className="text-xs text-slate-400">{t("触控笔/手写板/鼠标书写;用笔时手指可滑动页面")}</span>
      </div>
      <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerEnter={hover} onPointerLeave={leave} onPointerCancel={leave}
        className="w-full rounded-xl border border-slate-300 bg-white" style={{ touchAction: fingerScroll ? "manipulation" : "none" }} />
    </div>
  );
});
export default HandwritePad;
