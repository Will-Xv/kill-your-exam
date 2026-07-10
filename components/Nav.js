"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef, useLayoutEffect } from "react";
import { useT } from "@/components/I18n";
import * as lab from "@/lib/uilab/store";
import { collectRects, snapMove, snapEdgeX } from "@/lib/uilab/snap";

const primary = [
  { href: "/exams", label: "追杀计划", icon: "🗂️" },
  { href: "/", label: "首页", icon: "🏠" },
  { href: "/materials", label: "补充资料", icon: "📎" },
  { href: "/study", label: "学习", icon: "📖" }
];
const more = [
  { href: "/mock", label: "模拟考", icon: "📝", desc: "限时全真模拟" },
  { href: "/prep", label: "屠杀准备", icon: "🎒", desc: "考务/应试自测" },
  { href: "/mistakes", label: "错题本", icon: "📕", desc: "重练做错的题" },
  { href: "/notes", label: "笔记本", icon: "📓", desc: "收藏的题+随手笔记" },
  { href: "/profile", label: "你的全部杀技", icon: "🧭", desc: "跨考试综合评估" },
  { href: "/checkpoints", label: "回档", icon: "↩️", desc: "撤销结构类大改" },
  { href: "/settings", label: "设置", icon: "⚙️", desc: "语言/档案/导出" },
  { href: "/feedback", label: "意见反馈", icon: "✉️", desc: "给开发者反馈" }
];

export default function Nav() {
  const t = useT();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState(null);
  const S = lab.useUiLab();
  const navRef = useRef(null);
  const onHome = path === "/";
  useEffect(() => { navigator.serviceWorker?.register("/sw.js").catch(() => {}); }, []);
  useEffect(() => { fetch("/api/me").then((r) => r.ok ? r.json() : null).then((d) => setMe(d?.user)).catch(() => {}); }, []);
  useEffect(() => { setOpen(false); }, [path]);
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
  const p = layout && layout["__nav"]; // 位置全站生效(其它页也跟随主页设的导航栏位置)

  useLayoutEffect(() => {
    if (!editing || !navRef.current || p) return;
    const r = navRef.current.getBoundingClientRect();
    lab.seed("__nav", { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), s: 1 });
  });

  if (path === "/login" || path.startsWith("/onboarding")) return null;
  const active = (h) => (h === "/" ? path === "/" : path.startsWith(h));
  const dockLeft = !(path.startsWith("/practice") || path.startsWith("/mock") || path === "/chat" || path.startsWith("/onboarding"));

  const extra = [];
  if (me?.isAdmin) extra.push({ href: "/admin", label: "管理面板", icon: "📈", desc: "使用情况/子账号" });
  if (me?.isDeveloper) extra.push({ href: "/dev", label: "开发者工具", icon: "🛠️", desc: "调试" });
  if (me?.isAdmin || me?.isDeveloper) extra.push({ href: "/bugs", label: "Bug 反馈", icon: "🐞", desc: "用户反馈的问题" });

  const gestureBase = () => { const start = navRef.current.getBoundingClientRect(); const others = collectRects(navRef.current); lab.pushHistory(); return { start, others }; };
  const begin = (e, handler) => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, p0 = { ...p }; const { start, others } = gestureBase();
    const m = (ev) => handler(ev.clientX - sx, ev.clientY - sy, p0, start, others);
    const up = () => { lab.setGuides([]); window.removeEventListener("pointermove", m); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", m); window.addEventListener("pointerup", up);
  };
  const mvN = (e) => begin(e, (dx, dy, p0, start, others) => { const r = snapMove(start, dx, dy, others); lab.setPos("__nav", { x: Math.round(p0.x + r.dx), y: Math.round(p0.y + r.dy) }); lab.setGuides(r.guides); });
  const eR = (e) => begin(e, (dx, _d, p0, start, others) => { const s = p0.s || 1; const { value, guide } = snapEdgeX(start.right + dx, others); lab.setPos("__nav", { w: Math.max(160, Math.round((value - start.left) / s)) }); lab.setGuides(guide ? [guide] : []); });
  const eL = (e) => begin(e, (dx, _d, p0, start, others) => { const s = p0.s || 1; const { value, guide } = snapEdgeX(start.left + dx, others); lab.setPos("__nav", { x: Math.round(p0.x + (value - start.left)), w: Math.max(160, Math.round((start.right - value) / s)) }); lab.setGuides(guide ? [guide] : []); });
  const sc = (e) => begin(e, (dx, _d, p0) => lab.setPos("__nav", { s: Math.max(0.5, Math.min(2, +((p0.s || 1) + dx / (p0.w || 400)).toFixed(3))) }));

  const navStyle = p ? { position: "fixed", left: p.x, top: p.y, width: p.w, maxWidth: "none", margin: 0, transform: `scale(${p.s || 1})`, transformOrigin: "top left", zIndex: editing ? 60 : 50 } : undefined;
  const grip = { position: "absolute", background: "#9e140c", border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.35)", zIndex: 30 };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="absolute bottom-16 left-1/2 w-[92%] max-w-md -translate-x-1/2 md:top-16 md:bottom-auto" onClick={(e) => e.stopPropagation()}>
            <div className="card grid grid-cols-2 gap-2 shadow-2xl animate-in">
              {[...more, ...extra].map((it) => (
                <Link key={it.href} href={it.href} className={`flex items-start gap-2 rounded-2xl p-3 transition ${active(it.href) ? "bg-[#efe0bd] text-[#6b4a25]" : "hover:bg-[#efe6cf]"}`}>
                  <span className="text-xl">{it.icon}</span>
                  <span><span className="block text-sm font-semibold">{t(it.label)}</span><span className="block text-xs text-[#8a7a54]">{t(it.desc)}</span></span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
      <nav className={`fixed bottom-0 left-0 right-0 z-50 md:top-0 md:bottom-auto ${dockLeft && !p ? "md:pr-[460px] lg:pr-[500px]" : ""}`}>
        <div ref={navRef} data-snap style={navStyle} className="mx-auto flex max-w-3xl items-center justify-around gap-1 border-t border-[#e4d5af] bg-[#f6efdc]/95 px-1 py-1.5 backdrop-blur-xl md:mt-3 md:justify-center md:gap-1 md:rounded-full md:border md:border-[#e4d5af] md:px-2 md:shadow-lg">
          {primary.map((it) => (
            <Link key={it.href} href={it.href}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[11px] font-medium transition md:flex-none md:flex-row md:gap-1.5 md:px-4 md:py-2 md:text-sm ${active(it.href) ? "text-[#6b4a25] md:bg-[#efe0bd]" : "text-[#8a6a2c] hover:text-[#2f2413]"}`}>
              <span className="text-lg md:text-base">{it.icon}</span><span>{t(it.label)}</span>
            </Link>
          ))}
          <button onClick={() => setOpen(!open)}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[11px] font-medium transition md:flex-none md:flex-row md:gap-1.5 md:px-4 md:py-2 md:text-sm ${open ? "text-[#6b4a25] md:bg-[#efe0bd]" : "text-[#8a6a2c] hover:text-[#2f2413]"}`}>
            <span className="text-lg md:text-base">☰</span><span>{t("更多")}</span>
          </button>
          {editing && (
            <>
              <div onPointerDown={mvN} title={t("拖动移动导航栏")} style={{ position: "absolute", inset: 0, zIndex: 20, cursor: "move", borderRadius: 9999 }} />
              <div onPointerDown={eL} title={t("改宽(左)")} style={{ ...grip, top: "50%", left: -7, width: 12, height: 24, marginTop: -12, borderRadius: 6, cursor: "ew-resize" }} />
              <div onPointerDown={eR} title={t("改宽(右)")} style={{ ...grip, top: "50%", right: -7, width: 12, height: 24, marginTop: -12, borderRadius: 6, cursor: "ew-resize" }} />
              <div onPointerDown={sc} title={t("缩放")} style={{ ...grip, right: -8, bottom: -8, width: 16, height: 16, borderRadius: 4, cursor: "nwse-resize" }} />
              <div style={{ position: "absolute", top: -12, left: 12, zIndex: 26, pointerEvents: "none" }} className="rounded-full bg-[#9e140c] px-2 py-0.5 text-[10px] font-bold text-white">{t("导航栏 · 可拖动")}</div>
            </>
          )}
        </div>
      </nav>
    </>
  );
}
