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
  const midRef = useRef(null);   // 上一个"中点":用中点+二次贝塞尔画,笔画才圆滑、不出折角
  const penSeen = useRef(false);
  const undoStack = useRef([]);
  const dirty = useRef(false);
  const [tool, setTool] = useState("pen"); // pen | eraser
  const [penErase, setPenErase] = useState(false); // 笔上的按钮正被按住(临时橡皮)
  const penEraseRef = useRef(false);
  const btnEraseRef = useRef(false);       // 本次落笔期间按钮一直算按着(兼容只在 pointerdown 上报按钮的浏览器)
  const ringRef = useRef(null);
  // 【只存改动的那一小块】撤销以前是整幅画布快照(扩到13格时一张54MB),所以只能存3步。
  // 改法:用一张【影子画布】保存"上一笔结束时"的画面;书写时记录这一笔的【包围盒】,
  // 抬笔时只把包围盒那一小块的【旧像素】压进撤销栈(一般几十~几百KB),再把新画面同步进影子。
  // 于是每步代价与画布高度无关,25 步也才几 MB —— 不必再牺牲撤销步数。
  const shadowRef = useRef(null);      // 离屏画布:上一笔结束时的画面
  const bboxRef = useRef(null);        // 这一笔的包围盒(设备像素)            // 橡皮大小光圈(直接改 DOM,不走 state——否则每次移动都重渲染,书写会卡)
  const [dbg, setDbg] = useState(false);   // ?pendebug=1 打开:实时显示本机上报的指针参数,用来定位"笔上按钮没反应"
  const dbgRef = useRef(null);
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
    applyTouch();   // 重建后重新套用手势规则
    // 影子画布跟着一起重建(尺寸必须与主画布一致,否则撤销的坐标会错位)
    try {
      const sh = shadowRef.current || (shadowRef.current = document.createElement("canvas"));
      sh.width = canvas.width; sh.height = canvas.height;
      const sc = sh.getContext("2d");
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.fillStyle = "#ffffff"; sc.fillRect(0, 0, sh.width, sh.height);
    } catch {}
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
        syncShadow();   // 影子要和主画布一致,否则第一次撤销会贴回空白
      };
      im.onerror = () => { rebuild(cssW, BASE_H); };
      im.src = initial;
    } else {
      rebuild(cssW, BASE_H);
    }
  }

  // 【扩充手写区域】纵向加长一个初始高度。dir="down" 往下加(默认),dir="up" 往上加。
  // 往上加时:新空白出现在【顶部】,原有笔迹整体下移一格 —— 所以贴回时要落在 y=BASE_H,
  // 而且【撤销栈里已存的小块坐标也必须整体下移】,否则之后撤销会贴到错的位置。
  // 次数上限 MAX_EXPAND 由上下两个方向【共用】。
  function expand(dir = "down") {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    if (slots > MAX_EXPAND) return;   // 已到顶(按钮此时也是禁用的),不再拉长
    const cssW = wrap.clientWidth;
    const oldH = heightRef.current;
    const up = dir === "up";
    let prev = null;
    try { prev = canvas.toDataURL("image/png"); } catch {}
    const grow = () => {
      rebuild(cssW, oldH + BASE_H);
      setSlots((n) => n + 1);
      if (up) {
        // 内容整体下移一格 → 撤销栈里每一块的 y 也要下移同样的设备像素
        const dpr = window.devicePixelRatio || 1;
        const dy = Math.round(BASE_H * dpr);
        undoStack.current = undoStack.current.map((pt) => ({ ...pt, y: pt.y + dy }));
        // 视觉稳定:画布向下长高、笔迹跟着下移,页面同步下滚一格,看起来笔迹没动
        try { window.scrollBy(0, BASE_H); } catch {}
      }
    };
    if (!prev) { grow(); syncShadow(); emit(true); return; }
    const im = new Image();
    im.onload = () => {
      grow();
      try { ctxRef.current.drawImage(im, 0, up ? BASE_H : 0, cssW, oldH); } catch {}   // 往上扩就贴到下半部分
      syncShadow();   // ★画布尺寸变了、内容重贴过,影子必须重新对齐,否则第一次撤销会把内容擦成空白
      emit(true);
    };
    im.onerror = () => { grow(); syncShadow(); emit(true); };
    im.src = prev;
  }

  // 把主画布现状整幅复制进影子(初次载入、扩充、清空之后各调一次)
  function syncShadow() {
    try {
      const c = canvasRef.current, sh = shadowRef.current;
      if (!c || !sh) return;
      if (sh.width !== c.width || sh.height !== c.height) { sh.width = c.width; sh.height = c.height; }
      const sc = sh.getContext("2d");
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.clearRect(0, 0, sh.width, sh.height);
      sc.drawImage(c, 0, 0);
    } catch {}
  }

  function pos(e) {
    const r = rectRef.current || canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  // 笔悬停/落笔时把画布 touch-action 临时设为 none(笔一定用于书写,不会被浏览器当成平移/滚动);笔离开再恢复
  // 【手指/笔的区分:靠 touch-action 的临时切换】笔一靠近(悬停或落笔)就把画布设成 none —— 笔写字、
  // 绝不滑屏;笔离开再恢复成手指模式,手指照常滑页面。这套机制【本来就是好的】。
  // ★真正的病:canvas 的 JSX 上也写过 style={{touchAction:...}},于是【React 每重渲染一次,
  //   就把这里用 JS 设好的值覆盖回去】—— 本轮新增的笔按钮状态/橡皮光圈/扩充计数让重渲染变频繁,
  //   笔就"写几笔之后开始滑屏"。修法只有一条:JSX 不许再设 touchAction,只由这里管。
  function applyTouch() {
    const c = canvasRef.current;
    if (c) c.style.touchAction = fingerScroll ? "manipulation" : "none";
  }
  function penForceDraw() { const c = canvasRef.current; if (c) c.style.touchAction = "none"; }
  function restoreTouch() { applyTouch(); }
  // 【撤销栈按字节封顶,不按条数】以前固定存 25 张整画布快照。画布可以扩充到 13 格,
  // 一张 1600×8840 的快照就 54MB —— 25 张 = 1.3GB 常驻,GC 压力直接把书写拖卡。
  // 改成按总字节封顶(48MB),画布越高能存的张数越少,但至少保住 3 步撤销。
  const UNDO_MAX_STEPS = 30;              // 现在每步只存一小块,存 30 步也很轻
  const UNDO_MAX_BYTES = 64 * 1024 * 1024; // 兜底:极端情况(整幅清空)也不让总量失控
  function undoBytes() { return undoStack.current.reduce((n, p) => n + (p.data ? p.data.data.length : 0), 0); }
  function pushUndo(patch) {
    if (!patch) return;
    undoStack.current.push(patch);
    while (undoStack.current.length > UNDO_MAX_STEPS || (undoStack.current.length > 1 && undoBytes() > UNDO_MAX_BYTES)) undoStack.current.shift();
  }
  // 落笔:开始记这一笔的包围盒(设备像素)
  function beginStroke() { bboxRef.current = null; }
  function growBBox(x, y, w) {   // x,y 是 CSS 像素;w=当前笔宽
    try {
      const dpr = window.devicePixelRatio || 1;
      const pad = (w / 2 + 2) * dpr;
      const px = x * dpr, py = y * dpr;
      const b = bboxRef.current;
      if (!b) bboxRef.current = { x0: px - pad, y0: py - pad, x1: px + pad, y1: py + pad };
      else { b.x0 = Math.min(b.x0, px - pad); b.y0 = Math.min(b.y0, py - pad); b.x1 = Math.max(b.x1, px + pad); b.y1 = Math.max(b.y1, py + pad); }
    } catch {}
  }
  // 抬笔:把包围盒那一小块的【旧像素】(来自影子画布)压栈,再把新画面同步进影子
  function commitStroke() {
    try {
      const c = canvasRef.current, sh = shadowRef.current, b = bboxRef.current;
      bboxRef.current = null;
      if (!c || !sh || !b) return;
      const x = Math.max(0, Math.floor(b.x0)), y = Math.max(0, Math.floor(b.y0));
      const w = Math.min(c.width - x, Math.ceil(b.x1 - b.x0) + 1), h = Math.min(c.height - y, Math.ceil(b.y1 - b.y0) + 1);
      if (w <= 0 || h <= 0) return;
      const sc = sh.getContext("2d");
      pushUndo({ x, y, data: sc.getImageData(x, y, w, h) });   // 旧像素
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.clearRect(x, y, w, h);
      sc.drawImage(c, x, y, w, h, x, y, w, h);                 // 影子跟上新画面
    } catch {}
  }
  // 整幅性改动(清空)才存整幅
  function snapshotFull() {
    try { const c = canvasRef.current; pushUndo({ x: 0, y: 0, data: c.getContext("2d").getImageData(0, 0, c.width, c.height) }); } catch {}
  }

  function down(e) {
    if (e.pointerType === "pen" || e.pointerType === "eraser") { penSeen.current = true; penForceDraw(); if (!fingerScroll) setFingerScroll(true); } // 一旦用笔,手指自动改为滚动页面
    if (e.pointerType === "touch" && (fingerScroll || penSeen.current)) return; // 手指用于滚动/防手掌误触,不当作书写
    if (e.pointerType === "pen" || e.pointerType === "eraser") {
      // 有的浏览器只在 pointerdown 的 button 里报一次侧键/橡皮头(之后 buttons 只剩 1),所以这里记下来
      if (e.button === 5 || e.button === 2 || ((e.buttons || 0) & 32) || ((e.buttons || 0) & 2) || e.pointerType === "eraser") btnEraseRef.current = true;
    }
    e.preventDefault();
    setPenErase(penErasing(e));
    if (dbg) report(e);
    ring(e, tool === "eraser" || penErasing(e));
    beginStroke();
    try { rectRef.current = canvasRef.current.getBoundingClientRect(); } catch {}   // 整笔复用这次测量
    drawing.current = true; last.current = pos(e); midRef.current = last.current;
    growBBox(last.current.x, last.current.y, tool === "eraser" || penErasing(e) ? ERASER_W : 5);
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch {}
  }
  // 橡皮光圈跟随:eraser=是否处于橡皮状态(手动选的或笔上按钮按住的)
  function report(e) {   // 诊断:把浏览器真正给到的值原样显示出来
    const el = dbgRef.current;
    if (!el || !e) return;
    el.textContent = `type=${e.pointerType} buttons=${e.buttons} button=${e.button} pressure=${(e.pressure || 0).toFixed(2)} erasing=${penErasing(e) ? "Y" : "N"}`;
  }

  const ringOn = useRef(false);
  function ring(e, eraser) {
    const el = ringRef.current;
    if (!el) return;
    if (!eraser || e.pointerType === "touch") {
      if (ringOn.current) { el.style.display = "none"; ringOn.current = false; }   // 只在真需要时写 DOM
      return;
    }
    ringOn.current = true;
    const p = pos(e);
    el.style.display = "block";
    el.style.transform = `translate(${p.x - ERASER_W / 2}px, ${p.y - ERASER_W / 2}px)`;
  }

  function move(e) {
    if (e.pointerType === "pen") penForceDraw(); // 笔悬停移动时也保持可书写
    // ★悬停(还没落笔)时也要更新:橡皮多大、擦到哪,抬着笔就能看见
    if (dbg) report(e);
    const hoverErase = tool === "eraser" || penErasing(e);
    if (hoverErase !== penEraseRef.current) { penEraseRef.current = hoverErase; setPenErase(penErasing(e)); }
    ring(e, hoverErase);
    if (!drawing.current) return;
    if (e.pointerType === "touch" && (fingerScroll || penSeen.current)) return;
    e.preventDefault();
    const ctx = ctxRef.current;
    const erasing = tool === "eraser" || penErasing(e);
    // 【取回被合并掉的采样点】浏览器每帧只派发一个 pointermove,但触控笔采样率 120~240Hz,
    // 中间的点被打包在事件里 —— 不用 getCoalescedEvents() 取出来,一笔快写下去就只剩每帧一个点,
    // lineTo 把它们连成长直线段(就是"笔画头尾被连成直线"的由来);主线程一卡掉帧,直线更长。
    let samples = [e];
    try { const co = e.getCoalescedEvents && e.getCoalescedEvents(); if (co && co.length) samples = co; } catch {}
    for (const ev of samples) {
      const p = pos(ev);
      const pressure = ev.pressure && ev.pressure > 0 ? ev.pressure : 0.5;
      if (erasing) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = ERASER_W; }
      else { ctx.strokeStyle = "#111111"; ctx.lineWidth = 1.2 + pressure * 3.2; }
      // 【中点二次曲线】以"上一个中点 → 本次中点"为一段,把上一个采样点当控制点:
      // 相邻线段天然相切,不会出现折角,比直接 lineTo 顺滑得多。
      const m = { x: (last.current.x + p.x) / 2, y: (last.current.y + p.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(midRef.current.x, midRef.current.y);
      ctx.quadraticCurveTo(last.current.x, last.current.y, m.x, m.y);
      ctx.stroke();
      growBBox(midRef.current.x, midRef.current.y, ctx.lineWidth);
      growBBox(last.current.x, last.current.y, ctx.lineWidth);
      growBBox(p.x, p.y, ctx.lineWidth);
      midRef.current = m; last.current = p;
    }
    dirty.current = true;
  }
  // 【别再每抬一次笔就同步编码整张画布】toDataURL 是同步的,画布扩充后要编码上千万像素,
  // 每一笔结束都卡一下 —— 这就是"书写变迟钝"的主因。改成:
  //   ①防抖 400ms(连着写好几笔只编码一次);②用异步的 toBlob,不阻塞主线程。
  // 抬笔离开画布(leave)时立刻 flush,保证"写完马上交卷"不会丢最后一笔。
  const emitTimer = useRef(0);
  function doEmit() {
    try {
      const c = canvasRef.current;
      if (!onChange || !c) return;
      if (!dirty.current) { onChange(""); return; }
      if (c.toBlob) {
        c.toBlob((b) => {
          if (!b) { try { onChange(c.toDataURL("image/png")); } catch {} return; }
          const fr = new FileReader();
          fr.onload = () => { try { onChange(String(fr.result || "")); } catch {} };
          fr.readAsDataURL(b);
        }, "image/png");
      } else { onChange(c.toDataURL("image/png")); }
    } catch {}
  }
  function emit(now) {
    clearTimeout(emitTimer.current);
    if (now) { doEmit(); return; }
    emitTimer.current = setTimeout(doEmit, 400);
  }
  useEffect(() => () => { clearTimeout(emitTimer.current); }, []);
  // 笔【悬停进入】时就先切成"不可滑" —— touch-action 是在手势【开始那一刻】判定的,等 pointerdown 再设就晚了
  function hover(e) { if (e.pointerType === "pen" || e.pointerType === "eraser") penForceDraw(); }
  function leave() { restoreTouch(); if (ringRef.current) ringRef.current.style.display = "none"; up(); emit(true); }   // 笔离开画布 → 立刻落定,别等防抖 // 笔/手指离开 -> 恢复该模式的手势
  function up() {
    // 收尾:把"最后一个中点 → 最后一个采样点"这一小段补上,否则每笔末端会短一截
    try {
      if (drawing.current && ctxRef.current && last.current && midRef.current) {
        const ctx = ctxRef.current;
        ctx.beginPath(); ctx.moveTo(midRef.current.x, midRef.current.y); ctx.lineTo(last.current.x, last.current.y); ctx.stroke();
        growBBox(last.current.x, last.current.y, ctx.lineWidth);
      }
    } catch {}
    midRef.current = null;
    const wasDrawing = drawing.current; drawing.current = false; last.current = null; rectRef.current = null; btnEraseRef.current = false; penEraseRef.current = false; setPenErase(false); if (wasDrawing) commitStroke(); emit(); }

  function undo() {
    const s = undoStack.current.pop();
    if (!s) return;
    try {
      const c = canvasRef.current, ctx2 = c.getContext("2d");
      ctx2.save(); ctx2.setTransform(1, 0, 0, 1, 0, 0);
      ctx2.putImageData(s.data, s.x, s.y);           // putImageData 用设备像素坐标,不受 scale 影响
      ctx2.restore();
      const sh = shadowRef.current;
      if (sh) { const sc = sh.getContext("2d"); sc.setTransform(1, 0, 0, 1, 0, 0); sc.putImageData(s.data, s.x, s.y); }
    } catch {}
    if (!undoStack.current.length) dirty.current = false;
    emit(true);
  }
  function clear() { const c = canvasRef.current, ctx = ctxRef.current; snapshotFull(); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.restore(); dirty.current = false; syncShadow(); emit(true); }

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

  // 上下两个扩充键共用这一个渲染,免得改一处漏一处
  const ExpandBtn = ({ dir }) => {
    const atCap = slots > MAX_EXPAND;
    const up = dir === "up";
    return (
      <button type="button" onClick={() => expand(dir)} disabled={atCap}
        title={atCap ? t("页面扩充到顶了,试试其他方式提交吧,手写的答案可以和其他提交方式的答案一起被看到")
                     : (up ? t("写不下了?点一下向上加一块空白,已写的内容不会动") : t("写不下了?点一下向下加一块空白,已写的内容不会动"))}
        className={`w-full rounded-xl border border-dashed py-1.5 text-sm font-medium sm:w-auto sm:px-4 ${atCap ? "border-slate-200 text-slate-400" : "border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
        {up ? "⤒" : "⤓"} {up ? t("向上扩充") : t("向下扩充")}{slots > 1 ? ` ×${slots}` : ""}
      </button>
    );
  };

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
        <span className="text-xs text-slate-400">{t("触控笔/手写板/鼠标书写;用笔时手指可滑动页面")}</span>
      </div>
      {/* 【向上扩充】写到顶部还想往上补内容时用;点它新空白加在上面,已写的整体下移 */}
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <ExpandBtn dir="up" />
      </div>
      <div className="relative">
        <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerEnter={hover} onPointerLeave={leave} onPointerCancel={leave}
          onContextMenu={(e) => e.preventDefault()}   /* 按住笔杆侧键时别弹右键菜单 */
          className="block w-full rounded-xl border border-slate-300 bg-white" />
        {/* 【橡皮大小光圈】手动选橡皮、或笔上按钮/橡皮头按住时,悬停就能看见会擦掉多大一圈 */}
        <div ref={ringRef} aria-hidden="true"
          style={{ display: "none", position: "absolute", left: 0, top: 0, width: ERASER_W, height: ERASER_W, borderRadius: "9999px", pointerEvents: "none", willChange: "transform" }}
          className="border-2 border-emerald-500/70 bg-emerald-400/15" />
      </div>
      {/* 【扩充键放画布下方】写到底部时上面的工具栏早滚出屏幕了,笔就停在这儿,直接点就能往下续。 */}
      {dbg && <p ref={dbgRef} className="mt-1 rounded bg-slate-900 px-2 py-1 font-mono text-[11px] text-emerald-300">{t("用笔碰一下画布看这里的数值")}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <ExpandBtn dir="down" />
        {slots > MAX_EXPAND && <span className="text-xs text-amber-700">{t("页面扩充到顶了,试试其他方式提交吧,手写的答案可以和其他提交方式的答案一起被看到")}</span>}
      </div>
    </div>
  );
});
export default HandwritePad;
