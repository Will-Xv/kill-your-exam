"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useT } from "@/components/I18n";
import { splitHandwriting } from "@/lib/handSplit";

// 手写作答画板:支持触控笔(三星 S-Pen / Apple Pencil)、鼠标、连电脑的写字板;带橡皮擦、撤销、清空。
// 【可纵向扩充】写不下时点「扩充手写区域」,每次纵向拉长一个初始高度(340),次数不限、原有笔迹原样保留。
// canvas 尺寸一改内容就会被清空,所以扩充=先把整张存成图 → 重建画布 → 原样贴回顶部。
// getImage()/onChange 都导出【整张画布】,所以拉长出来的部分天然一并提交给判卷,不用额外处理。
// 通过 ref 暴露 getImage():有内容时返回 {mime:"image/png", data:base64},空则 null。
const BASE_H = 340;      // 初始高度;每点一次「扩充」就多加这么多
// 【扩充次数上限】服务端附件有一道保险丝(MAX_ATTACH),真让人无限拉下去,超长作答会在提交时被悄悄截断——
// 那比没有这个功能更糟(人辛辛苦苦写满了,结果判卷只看到前面一截,还不知道)。所以在【还能写的时候】就拦住:
// 到顶了按钮变灰并说明原因,而不是让他写完才发现丢内容。12 次(总高 13 格)在最窄的手机上也只切十来片,离保险丝很远。
const MAX_EXPAND = 12;
const ERASER_W = 22;     // 橡皮直径(与实际擦除笔宽一致,悬停光圈就是它的真实大小)

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
  const [penErase, setPenErase] = useState(false); // 笔上的按钮正被按住(临时橡皮)
  const penEraseRef = useRef(false);
  const ringRef = useRef(null);            // 橡皮大小光圈(直接改 DOM,不走 state——否则每次移动都重渲染,书写会卡)
  const [slots, setSlots] = useState(1);   // 当前是初始高度的几倍(1=没扩充过)
  const heightRef = useRef(BASE_H);        // 当前画布的 CSS 高度
  const [fingerScroll, setFingerScroll] = useState(() => { if (typeof window === "undefined") return false; try { return localStorage.getItem("kye_finger_scroll") === "1"; } catch { return false; } }); // 手指用于滚动/缩放(只用笔书写);跨题跨考试记住

  // 重建画布到指定 CSS 尺寸。★canvas 的 width/height 一改,画布内容就被清空——
  // 所以调用方负责在这之后把旧笔迹贴回来(见 expand / setup)。
  function rebuild(cssW, cssH) {
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    canvas.style.width = cssW + "px"; canvas.style.height = cssH + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, cssW, cssH);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctxRef.current = ctx;
    heightRef.current = cssH;
  }

  function setup() {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const cssW = wrap.clientWidth;
    if (initial) {
      // 【恢复草稿要连高度一起还原】草稿存的是整张画布;若之前扩充过,这张图就比 340 高,
      // 直接按固定 340 贴回去会把笔迹压扁。按原图宽高比算出该多高,再向上取整到整数格。
      const im = new Image();
      im.onload = () => {
        const natH = im.width > 0 ? Math.round(cssW * (im.height / im.width)) : BASE_H;
        const n = Math.max(1, Math.ceil(natH / BASE_H));
        rebuild(cssW, BASE_H * n);
        setSlots(n);
        try { ctxRef.current.drawImage(im, 0, 0, cssW, natH); dirty.current = true; } catch {}
      };
      im.onerror = () => { rebuild(cssW, BASE_H); };
      im.src = initial;
    } else {
      rebuild(cssW, BASE_H);
    }
  }

  // 【扩充手写区域】纵向拉长一个初始高度,原有笔迹原样保留(先存图→重建→贴回顶部),次数不限。
  // 扩充后 emit() 一次,让父层存下的草稿也是这张更高的图,刷新回来高度不会缩水。
  function expand() {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    if (slots > MAX_EXPAND) return;   // 已到顶(按钮此时也是禁用的),不再拉长
    const cssW = wrap.clientWidth;
    const oldH = heightRef.current;
    let prev = null;
    try { prev = canvas.toDataURL("image/png"); } catch {}
    const grow = () => { rebuild(cssW, oldH + BASE_H); setSlots((n) => n + 1); };
    if (!prev) { grow(); emit(); return; }
    const im = new Image();
    im.onload = () => {
      grow();
      try { ctxRef.current.drawImage(im, 0, 0, cssW, oldH); } catch {}  // 原样贴回顶部,不缩放
      emit();
    };
    im.onerror = () => { grow(); emit(); };
    im.src = prev;
  }

  useEffect(() => { setup(); }, []); // eslint-disable-line
  useEffect(() => { try { localStorage.setItem("kye_finger_scroll", fingerScroll ? "1" : "0"); } catch {} }, [fingerScroll]);

  // 【笔上的原生按钮 = 临时橡皮擦】按 W3C Pointer Events 规范判断,不针对任何厂商:
  //   buttons & 32 = 笔尾/橡皮头(Surface Pen 倒过来擦、Wacom 反转笔)
  //   buttons & 2  = 笔杆上的侧键(三星 S Pen 按住侧键、多数主动笔)
  // 命中任一就【临时】按橡皮走(松开即恢复原来选的笔/橡皮),不改用户选的工具。
  // Apple Pencil 无按钮 → 两位都不会置位,行为不受影响。
  function penErasing(e) {
    if (!e || e.pointerType !== "pen") return false;
    const b = e.buttons || 0;
    return (b & 32) !== 0 || (b & 2) !== 0;
  }

  function pos(e) { const r = canvasRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  // 笔悬停/落笔时把画布 touch-action 临时设为 none(笔一定用于书写,不会被浏览器当成平移/滚动);笔离开再恢复
  function penForceDraw() { const c = canvasRef.current; if (c) c.style.touchAction = "none"; }
  function restoreTouch() { const c = canvasRef.current; if (c) c.style.touchAction = fingerScroll ? "manipulation" : "none"; }
  function snapshot() { try { const c = canvasRef.current; undoStack.current.push(c.getContext("2d").getImageData(0, 0, c.width, c.height)); if (undoStack.current.length > 25) undoStack.current.shift(); } catch {} }

  function down(e) {
    if (e.pointerType === "pen") { penSeen.current = true; penForceDraw(); if (!fingerScroll) setFingerScroll(true); } // 一旦用笔,手指自动改为滚动页面
    if (e.pointerType === "touch" && (fingerScroll || penSeen.current)) return; // 手指用于滚动/防手掌误触,不当作书写
    e.preventDefault();
    setPenErase(penErasing(e));
    ring(e, tool === "eraser" || penErasing(e));
    snapshot();
    drawing.current = true; last.current = pos(e);
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch {}
  }
  // 橡皮光圈跟随:eraser=是否处于橡皮状态(手动选的或笔上按钮按住的)
  function ring(e, eraser) {
    const el = ringRef.current;
    if (!el) return;
    if (!eraser || e.pointerType === "touch") { el.style.display = "none"; return; }
    const p = pos(e);
    el.style.display = "block";
    el.style.transform = `translate(${p.x - ERASER_W / 2}px, ${p.y - ERASER_W / 2}px)`;
  }

  function move(e) {
    if (e.pointerType === "pen") penForceDraw(); // 笔悬停移动时也保持可书写
    // ★悬停(还没落笔)时也要更新:橡皮多大、擦到哪,抬着笔就能看见
    const hoverErase = tool === "eraser" || penErasing(e);
    if (hoverErase !== penEraseRef.current) { penEraseRef.current = hoverErase; setPenErase(penErasing(e)); }
    ring(e, hoverErase);
    if (!drawing.current) return;
    if (e.pointerType === "touch" && (fingerScroll || penSeen.current)) return;
    e.preventDefault();
    const ctx = ctxRef.current; const p = pos(e);
    const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
    if (tool === "eraser" || penErasing(e)) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = ERASER_W; }
    else { ctx.strokeStyle = "#111111"; ctx.lineWidth = 1.2 + pressure * 3.2; }
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p; dirty.current = true;
  }
  function emit() { try { if (onChange && canvasRef.current) onChange(dirty.current ? canvasRef.current.toDataURL("image/png") : ""); } catch {} }
  function hover(e) { if (e.pointerType === "pen") penForceDraw(); } // 笔悬停进入 -> 立刻可书写
  function leave() { restoreTouch(); if (ringRef.current) ringRef.current.style.display = "none"; up(); } // 笔/手指离开 -> 恢复该模式的手势
  function up() { drawing.current = false; last.current = null; penEraseRef.current = false; setPenErase(false); emit(); }

  function undo() { const s = undoStack.current.pop(); if (s) { canvasRef.current.getContext("2d").putImageData(s, 0, 0); if (!undoStack.current.length) dirty.current = false; emit(); } }
  function clear() { const c = canvasRef.current, ctx = ctxRef.current; snapshot(); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.restore(); dirty.current = false; emit(); }

  useImperativeHandle(ref, () => ({
    getImage() {
      if (!dirty.current || !canvasRef.current) return null;
      try { const url = canvasRef.current.toDataURL("image/png"); return { name: "handwriting.png", mime: "image/png", data: url.split(",")[1] }; } catch { return null; }
    },
    // 【整张 + 切片】拉长过的长图又窄又高,模型整体降采样会看糊字迹;所以除了整张,再额外附上几张切片。
    // 整张始终在第一位(给全局结构),切片按从上到下顺序跟在后面(给清晰字迹)——用哪个由判卷模型自己挑,
    // 也可以两者对照着看。不够高的图不切,返回的就只有整张一张。
    async getImages() {
      if (!dirty.current || !canvasRef.current) return [];
      let url = null;
      try { url = canvasRef.current.toDataURL("image/png"); } catch { return []; }
      const full = { name: "handwriting.png", mime: "image/png", data: url.split(",")[1] };
      let parts = [];
      try { parts = await splitHandwriting(url); } catch {}   // 切片失败不影响交卷,整张照常提交
      return [full, ...parts];
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
        <div className="ml-1 inline-flex rounded-full border border-slate-200 p-0.5 text-xs" title={t("手指是用来书写,还是用来滑动/缩放页面(用笔时建议选『滑动』)")}>
          <button type="button" onClick={() => setFingerScroll(false)} className={`rounded-full px-2.5 py-1 transition ${!fingerScroll ? "bg-amber-500 font-medium text-white" : "text-slate-500"}`}>👆 {t("手指书写")}</button>
          <button type="button" onClick={() => setFingerScroll(true)} className={`rounded-full px-2.5 py-1 transition ${fingerScroll ? "bg-amber-500 font-medium text-white" : "text-slate-500"}`}>✋ {t("手指滑动")}</button>
        </div>
        {penErase && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">🧽 {t("笔上的按钮按住中:临时橡皮")}</span>}
        <span className="text-xs text-slate-400">{t("触控笔/手写板/鼠标书写;用笔时手指可滑动页面。笔上有按钮或橡皮头的,按住即可直接擦。")}</span>
      </div>
      <div className="relative">
        <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerEnter={hover} onPointerLeave={leave} onPointerCancel={leave}
          onContextMenu={(e) => e.preventDefault()}   /* 按住笔杆侧键时别弹右键菜单 */
          className="block w-full rounded-xl border border-slate-300 bg-white" style={{ touchAction: fingerScroll ? "manipulation" : "none" }} />
        {/* 【橡皮大小光圈】手动选橡皮、或笔上按钮/橡皮头按住时,悬停就能看见会擦掉多大一圈 */}
        <div ref={ringRef} aria-hidden="true"
          style={{ display: "none", position: "absolute", left: 0, top: 0, width: ERASER_W, height: ERASER_W, borderRadius: "9999px", pointerEvents: "none", willChange: "transform" }}
          className="border-2 border-emerald-500/70 bg-emerald-400/15" />
      </div>
      {/* 【扩充键放画布下方】写到底部时上面的工具栏早滚出屏幕了,笔就停在这儿,直接点就能往下续。 */}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={expand} disabled={slots > MAX_EXPAND}
          title={slots > MAX_EXPAND ? t("页面扩充到顶了,试试其他方式提交吧,手写的答案可以和其他提交方式的答案一起被看到") : t("写不下了?点一下向下加一块空白,已写的内容不会动")}
          className={`w-full rounded-xl border border-dashed py-2 text-sm font-medium sm:w-auto sm:px-4 ${slots > MAX_EXPAND ? "border-slate-200 text-slate-400" : "border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>⤓ {t("扩充手写区域")}{slots > 1 ? ` ×${slots}` : ""}</button>
        {slots > MAX_EXPAND && <span className="text-xs text-amber-700">{t("页面扩充到顶了,试试其他方式提交吧,手写的答案可以和其他提交方式的答案一起被看到")}</span>}
      </div>
    </div>
  );
});
export default HandwritePad;
