"use client";
import { createContext, useContext, useRef, useEffect, useState, useCallback, Fragment, Children } from "react";
import { createPortal } from "react-dom";
import * as lab from "@/lib/uilab/store";
import { TEMPLATES, TEMPLATE_ORDER } from "@/lib/uilab/templates";
import { useT } from "@/components/I18n";
import { KillerSlot } from "@/lib/uilab/killerSlot";

const Ctx = createContext(null);

export function LayoutLab({ enabled, children }) {
  const S = lab.useUiLab();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { lab.initClient(); setMounted(true); }, []);
  useEffect(() => { lab.setEnabled(enabled); }, [enabled]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const on = () => lab.setDesktop(mq.matches); on();
    try { mq.addEventListener("change", on); } catch { mq.addListener(on); }
    return () => { try { mq.removeEventListener("change", on); } catch { mq.removeListener(on); } };
  }, []);
  useEffect(() => () => lab.exitEdit(), []);

  const arr = Children.toArray(children).filter((c) => c && c.props && c.props.id);
  const orderedIds = arr.map((c) => c.props.id);
  const childById = {}; for (const c of arr) childById[c.props.id] = c;

  const editing = S.editing && enabled && S.isDesktop;
  const rl = lab.contentToRender();
  const pageScroll = !!(rl && rl.template === "single"); // 整列=整页滚;其余=分区固定、内部滚
  childById["__killer"] = <Editable id="__killer" fill={!pageScroll}><KillerItem fill={!pageScroll} /></Editable>; // 杀手作为可拖动的"栏目"

  // 拖动控制:命中测试分区 + 插入位置
  const startDrag = (id, e) => {
    e.preventDefault(); e.stopPropagation();
    lab.pushHistory();
    const hit = (x, y) => {
      const zones = document.querySelectorAll("[data-zone]");
      for (const zel of zones) {
        const r = zel.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top - 20 && y <= r.bottom + 20) {
          const z = zel.getAttribute("data-zone");
          const items = zel.querySelectorAll("[data-item]");
          let idx = items.length;
          for (let i = 0; i < items.length; i++) { const ir = items[i].getBoundingClientRect(); if (y < ir.top + ir.height / 2) { idx = i; break; } }
          return { zone: z, index: idx };
        }
      }
      return null;
    };
    const move = (ev) => { const t = hit(ev.clientX, ev.clientY); lab.setDrop(t); };
    const up = (ev) => {
      const t = hit(ev.clientX, ev.clientY) || S.drop;
      if (t) lab.moveItem(id, t.zone, t.index);
      lab.setDrop(null);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  let body;
  if (!rl) {
    body = <>{children}</>; // 原始首页(自然流)
  } else {
    const t = TEMPLATES[rl.template] || TEMPLATES.single;
    const zoneIds = t.zones;
    const placed = new Set(); for (const z of zoneIds) for (const id of (rl.zones[z] || [])) placed.add(id);
    const orphans = orderedIds.filter((id) => !placed.has(id)); // 某考试才出现的块 → 归第一个分区
    if (S.isDesktop) {
      const narrow = rl.template === "single" || rl.template === "tb";
      body = (
        <div style={{ maxWidth: narrow ? 820 : 1360, margin: "0 auto", ...(pageScroll ? {} : { height: "calc(100dvh - 7.5rem)" }) }}>
          <div style={{ display: "grid", gap: 16, ...(pageScroll ? {} : { height: "100%" }), gridTemplateColumns: t.gridTemplateColumns, gridTemplateRows: t.gridTemplateRows, gridTemplateAreas: t.gridTemplateAreas }}>
            {zoneIds.map((z, zi) => (
              <Zone key={z} zoneId={z} pageScroll={pageScroll} editing={editing} drop={S.drop} childById={childById}
                ids={[...(rl.zones[z] || []), ...(zi === 0 ? orphans : [])].filter((id) => childById[id])} />
            ))}
          </div>
        </div>
      );
    } else {
      const flat = []; for (const z of zoneIds) for (const id of (rl.zones[z] || [])) if (childById[id] && id !== "__killer") flat.push(id);
      for (const id of orphans) if (childById[id] && id !== "__killer") flat.push(id);
      body = <div className="flex flex-col gap-4">{flat.map((id) => <Fragment key={id}>{childById[id]}</Fragment>)}</div>;
    }
  }

  return (
    <Ctx.Provider value={{ enabled, editing, startDrag }}>
      {body}
      {enabled && S.isDesktop && mounted && createPortal(<Toolbar S={S} />, document.body)}
      <style>{`
        .lab-item{ position:relative; }
        .lab-item.edit{ outline:1.5px dashed rgba(158,20,12,.5); outline-offset:3px; border-radius:16px; }
        .lab-grip{ position:absolute; top:6px; left:8px; z-index:20; display:flex; align-items:center; gap:4px; cursor:grab; user-select:none;
          background:#9e140c; color:#fff; font-size:11px; font-weight:700; padding:2px 8px; border-radius:9999px; box-shadow:0 1px 4px rgba(0,0,0,.35); }
        .lab-zone-edit{ outline:1px dashed rgba(158,20,12,.28); outline-offset:6px; border-radius:18px; min-height:60px; }
        .lab-empty{ display:grid; place-items:center; min-height:80px; color:#9a824f; font-size:12px; border:2px dashed #e4d5af; border-radius:16px; }
        .lab-drop{ height:3px; border-radius:3px; background:#2563eb; margin:2px 0; }
        .lab-thumb{ width:7px; border-radius:9999px; cursor:grab; background:rgba(61,43,16,.45); transition:background .15s ease, width .12s ease; }
        .lab-thumb:hover{ background:#efe3c4; width:9px; }
        .lab-hidebar{ scrollbar-width:none; -ms-overflow-style:none; }
        .lab-hidebar::-webkit-scrollbar{ display:none; width:0; height:0; }
        .lab-fancybar{ scrollbar-width:thin; scrollbar-color:rgba(61,43,16,.4) transparent; }
        .lab-fancybar::-webkit-scrollbar{ width:8px; height:8px; }
        .lab-fancybar::-webkit-scrollbar-track{ background:transparent; margin:6px; }
        .lab-fancybar::-webkit-scrollbar-thumb{ background:rgba(61,43,16,.35); border-radius:9999px; border:2px solid transparent; background-clip:content-box; }
        .lab-fancybar::-webkit-scrollbar-thumb:hover{ background:rgba(61,43,16,.55); border:2px solid transparent; background-clip:content-box; }
      `}</style>
    </Ctx.Provider>
  );
}

function KillerItem({ fill }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-3xl border border-[#e4d5af] bg-[#e9dcb6]/95 px-3 pb-3 pt-3 shadow-xl shadow-[#3d2b10]/10" style={fill ? { flex: "1 1 0", minHeight: 0 } : { height: "72vh" }}>
      <KillerSlot />
    </div>
  );
}

function Zone({ zoneId, ids, childById, editing, drop, pageScroll }) {
  const here = editing && drop && drop.zone === zoneId;
  const vpRef = useRef(null);
  const [bar, setBar] = useState(null); // 自定义滚动条 {top,h};null=不需要
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
  }, [recompute, ids.length]); // 无 ResizeObserver,不会死循环
  const dragThumb = (e) => {
    e.preventDefault(); e.stopPropagation();
    const el = vpRef.current; const sy = e.clientY, s0 = el.scrollTop;
    const track = el.clientHeight, sh = el.scrollHeight, h = Math.max(28, track * el.clientHeight / sh);
    const move = (ev) => { el.scrollTop = s0 + (ev.clientY - sy) * (sh - el.clientHeight) / (track - h); };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const content = (
    <>
      {ids.map((id, i) => (
        <Fragment key={id}>
          {here && drop.index === i && <div className="lab-drop" />}
          {childById[id]}
        </Fragment>
      ))}
      {here && drop.index >= ids.length && <div className="lab-drop" />}
      {editing && ids.length === 0 && <div className="lab-empty">拖到这里</div>}
    </>
  );
  if (pageScroll) {
    return (
      <div data-zone={zoneId} style={{ gridArea: zoneId, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }} className={editing ? "lab-zone-edit" : ""}>{content}</div>
    );
  }
  // 只放了杀手的格子:杀手卡片自己就是圆角卡片、内部自带滚动 —— 直接铺进格子,不再套滚动遮罩(避免双重圆角 + 头部被滚走)
  if (ids.length === 1 && ids[0] === "__killer") {
    return (
      <div data-zone={zoneId} style={{ gridArea: zoneId, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }} className={editing ? "lab-zone-edit" : ""}>{content}</div>
    );
  }
  // 圆角视口 + 视口右外侧一根自定义圆角滚动条(原生条隐藏),避免滚动条压在圆角上
  return (
    <div data-zone={zoneId} style={{ gridArea: zoneId, minWidth: 0, minHeight: 0, position: "relative", paddingRight: 14 }} className={editing ? "lab-zone-edit" : ""}>
      <div ref={vpRef} onScroll={recompute} className="lab-hidebar" style={{ height: "100%", overflowY: "auto", overscrollBehavior: "contain", borderRadius: 24, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>{content}</div>
      {bar && <div onPointerDown={dragThumb} className="lab-thumb" title="拖动滚动" style={{ position: "absolute", top: bar.top, right: 3, height: bar.h }} />}
    </div>
  );
}

export function Editable({ id, children, fill }) {
  const ctx = useContext(Ctx);
  const wrap = fill ? { flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" } : undefined;
  const inner = fill ? { pointerEvents: "none", flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" } : { pointerEvents: "none" };
  if (!ctx || !ctx.editing) return <div data-item data-id={id} className="lab-item" style={wrap}>{children}</div>;
  return (
    <div data-item data-id={id} className="lab-item edit" style={wrap}>
      <div className="lab-grip" onPointerDown={(e) => ctx.startDrag(id, e)} title="拖动:排序 / 移到其它分区">⠿ 拖动</div>
      <div style={inner}>{children}</div>
    </div>
  );
}

function Toolbar({ S }) {
  const t = useT();
  const active = lab.activePreset();
  const editing = S.editing;
  const [libOpen, setLibOpen] = useState(false);
  const curTpl = (S.working && S.working.template) || "single";
  const btn = "rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40";
  const ghost = btn + " bg-white/70 text-[#3d2b10] ring-1 ring-[#e4d5af]";
  return (
    <div className="fixed bottom-6 left-5 z-[60] flex max-w-[94vw] flex-col items-start gap-2">
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
      {editing && (
        <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-[#e4d5af] bg-[#f6efdc] p-1.5 shadow-xl">
          <span className="px-1 text-[11px] font-semibold text-[#8a6a2c]">分区:</span>
          {TEMPLATE_ORDER.map((k) => (
            <button key={k} onClick={() => lab.setTemplate(k)} className={"rounded-lg px-2 py-1 text-[11px] " + (curTpl === k ? "bg-[#2f2413] text-[#f6efdd]" : "bg-white/70 text-[#3d2b10] ring-1 ring-[#e4d5af] hover:brightness-95")}>{TEMPLATES[k].label}</button>
          ))}
        </div>
      )}
      {!editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <button className={btn + " bg-[#2f2413] text-[#f6efdd] shadow-lg hover:opacity-90"} onClick={() => lab.enterEdit(labIds())}>🎨 {t("编辑布局")}</button>
          <button className={btn + " bg-[#f6efdc] text-[#3d2b10] ring-1 ring-[#e4d5af] hover:brightness-95"} onClick={() => setLibOpen((v) => !v)}>📚 {t("布局库")}</button>
          {active && <button className={btn + " bg-[#f6efdc] text-[#9e140c] ring-1 ring-[#e4d5af] hover:brightness-95"} onClick={() => lab.revertActive()} title={t("回到原始首页")}>↩ {t("撤回")}</button>}
          {!active && S.lastReverted && S.presets.some((p) => p.id === S.lastReverted) && <button className={btn + " bg-[#f6efdc] text-[#3d2b10] ring-1 ring-[#e4d5af] hover:brightness-95"} onClick={() => lab.reapplyReverted()} title={t("重新套用刚撤回的布局")}>↪ {t("恢复布局")}</button>}
          {active && <button className={btn + " bg-[#9e140c] text-white hover:opacity-90"} onClick={() => { if (window.confirm(t("发布为默认后,所有用户的首页都会用这套布局。确定发布?"))) lab.publishDefault(); }}>🌐 {t("发布为默认")}</button>}
          {S.publishedDefault && <button className={btn + " bg-[#f6efdc] text-[#9e140c] ring-1 ring-[#e4d5af] hover:brightness-95"} onClick={() => { if (window.confirm(t("取消发布默认布局?所有用户会恢复原始首页。"))) lab.unpublishDefault(); }}>{t("取消发布")}</button>}
        </div>
      ) : (
        <div className="flex max-w-[94vw] flex-wrap items-center gap-1.5 rounded-2xl border border-[#e4d5af] bg-[#f6efdc] p-2 shadow-xl">
          <span className="px-1 text-[11px] text-[#8a6a2c]">拖手柄:排序 / 跨区移动</span>
          <button className={ghost} disabled={!S.past.length} onClick={() => lab.undo()}>↶ {t("撤销")}</button>
          <button className={ghost} disabled={!S.future.length} onClick={() => lab.redo()}>↷ {t("重做")}</button>
          <button className={ghost} onClick={() => lab.resetNatural()} title={t("恢复到默认排版")}>⟲ {t("恢复默认")}</button>
          <button className={btn + " bg-[#2f2413] text-[#f6efdd]"} onClick={() => { const n = window.prompt(t("给这套布局起个名字:"), active ? active.name : t("我的布局")); if (n && n.trim()) lab.savePreset(n.trim()); }}>💾 {t("另存为")}</button>
          {active && <button className={btn + " bg-[#3d2b10] text-[#f6efdd]"} onClick={() => lab.overwriteActive()} title={t("覆盖保存到:") + active.name}>💾 {t("覆盖")}「{active.name}」</button>}
          <button className={btn + " bg-[#9e140c] text-white hover:opacity-90"} onClick={() => { if (window.confirm(t("发布为默认后,所有用户的首页都会用这套布局。确定发布?"))) lab.publishDefault(); }}>🌐 {t("发布为默认")}</button>
          <button className={btn + " bg-[#f6efdc] text-[#3d2b10] ring-1 ring-[#e4d5af]"} onClick={() => lab.exitEdit()}>✓ {t("完成")}</button>
        </div>
      )}
    </div>
  );
}

// 进入编辑时,把当前 DOM 里出现的内容块 id(按出现顺序)交给 store 初始化布局
function labIds() {
  if (typeof document === "undefined") return [];
  const ids = Array.from(document.querySelectorAll("[data-item]")).map((el) => el.getAttribute("data-id")).filter(Boolean);
  if (!ids.includes("__killer")) ids.push("__killer");
  return ids;
}
