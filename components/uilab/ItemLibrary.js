"use client";
// 栏目分配面板:五列(导航栏/更多/更多功能/首页大模块/隐藏),把功能当卡片在列之间拖(带跟手 + 落位动画)。
// 拖完即时生效在开发者自己视图;点「发布」后所有用户生效。第三阶段杀手也走同一放置表。
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import * as placement from "@/lib/uilab/placement";
import { allItems, getItem, itemVisibleTo } from "@/lib/uilab/items";
import { useT } from "@/components/I18n";
import { useFlip } from "@/lib/uilab/flip";

const COLS = [
  { where: "nav", label: "导航栏", hint: "顶部按钮" },
  { where: "more", label: "更多菜单", hint: "☰ 下拉" },
  { where: "morefeatures", label: "更多功能", hint: "首页卡片" },
  { where: "zone", label: "首页大模块", hint: "像排行榜" },
  { where: "hidden", label: "隐藏", hint: "不显示" }
];

export default function ItemLibrary({ onClose }) {
  const t = useT();
  const S = placement.useItems();
  const [bp, setBp] = useState("desktop");
  const [mounted, setMounted] = useState(false);
  const [me, setMe] = useState({});
  const rootRef = useRef(null);
  const flipOverride = useRef({});
  useEffect(() => { setMounted(true); placement.startEditFromCurrent(); fetch("/api/me").then((r) => r.json()).then((d) => setMe(d.user || {})).catch(() => {}); }, []);

  const pl = placement.placementNow();
  const assignable = allItems().filter((it) => itemVisibleTo(it, me));
  const inThisBp = new Set((pl[bp] || []).map((e) => e.item));
  const colItems = {};
  for (const c of COLS) colItems[c.where] = placement.itemsIn(bp, c.where, pl).map((e) => getItem(e.item)).filter(Boolean);
  colItems.hidden = [...colItems.hidden, ...assignable.filter((it) => !inThisBp.has(it.id))];

  const sig = JSON.stringify(pl[bp] || []) + "|" + bp;
  useFlip(rootRef, sig, { override: flipOverride });

  const startDrag = (id, e) => {
    e.preventDefault(); e.stopPropagation();
    const chip = e.currentTarget.closest ? e.currentTarget.closest("[data-chip]") : null;
    const sx = e.clientX, sy = e.clientY;
    let clone = null;
    if (chip) {
      const r0 = chip.getBoundingClientRect();
      clone = chip.cloneNode(true);
      Object.assign(clone.style, { position: "fixed", left: r0.left + "px", top: r0.top + "px", width: r0.width + "px", margin: "0", pointerEvents: "none", zIndex: "99999", boxShadow: "0 14px 32px rgba(0,0,0,.36)", opacity: "0.97" });
      document.body.appendChild(clone);
      chip.style.opacity = "0";
    }
    const colAt = (x, y) => { const cols = document.querySelectorAll("[data-col]"); for (const el of cols) { const r = el.getBoundingClientRect(); if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el.getAttribute("data-col"); } return null; };
    const move = (ev) => { if (clone) clone.style.transform = "translate(" + (ev.clientX - sx) + "px," + (ev.clientY - sy) + "px)"; };
    const up = (ev) => {
      const target = colAt(ev.clientX, ev.clientY);
      if (target && clone) flipOverride.current[id] = clone.getBoundingClientRect();
      if (clone) clone.remove();
      if (chip) chip.style.opacity = "";
      if (target) placement.moveItem(bp, id, target);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  if (!mounted) return null;
  const btn = { padding: "6px 12px", fontSize: 12, fontWeight: 700, borderRadius: 9999, cursor: "pointer", border: "none" };
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(30,20,10,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflow: "auto" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(1120px,97vw)", marginTop: "3vh", background: "#f6efdc", borderRadius: 20, border: "1px solid #e4d5af", padding: 16, boxShadow: "0 24px 64px rgba(0,0,0,.42)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontWeight: 800, color: "#2f2413", fontSize: 18 }}>🧩 {t("栏目分配")} <span style={{ fontSize: 12, color: "#8a7a54", fontWeight: 500 }}>{t("把功能拖到想放的位置")}</span></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ display: "flex", borderRadius: 9999, overflow: "hidden", border: "1px solid #e4d5af" }}>
              <button onClick={() => setBp("desktop")} style={{ ...btn, borderRadius: 0, background: bp === "desktop" ? "#2f2413" : "#fff", color: bp === "desktop" ? "#f6efdd" : "#3d2b10" }}>{t("电脑")}</button>
              <button onClick={() => setBp("mobile")} style={{ ...btn, borderRadius: 0, background: bp === "mobile" ? "#2f2413" : "#fff", color: bp === "mobile" ? "#f6efdd" : "#3d2b10" }}>{t("手机")}</button>
            </div>
            <button onClick={() => { if (window.confirm(t("发布为默认?所有用户的功能位置都会按这个。"))) placement.publish(); }} style={{ ...btn, background: "#9e140c", color: "#fff" }}>🌐 {t("发布")}</button>
            {S.publishedDefault && <button onClick={() => { if (window.confirm(t("取消发布?所有用户恢复默认。"))) placement.unpublish(); }} style={{ ...btn, background: "#fff", color: "#9e140c", border: "1px solid #e4d5af" }}>{t("取消发布")}</button>}
            <button onClick={() => { placement.resetWorking(); }} style={{ ...btn, background: "#fff", color: "#3d2b10", border: "1px solid #e4d5af" }}>{t("重置")}</button>
            <button onClick={onClose} style={{ ...btn, background: "#2f2413", color: "#f6efdd" }}>{t("关闭")}</button>
          </div>
        </div>
        <div ref={rootRef} style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 10 }}>
          {COLS.map((c) => (
            <div key={c.where} data-col={c.where} style={{ minHeight: 140, background: "#efe6cf", borderRadius: 14, border: "1px dashed #d9c89b", padding: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#6b4a25", marginBottom: 6 }}>{t(c.label)} <span style={{ fontWeight: 500, color: "#9a824f" }}>· {t(c.hint)}</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {colItems[c.where].map((it) => (
                  <div key={it.id} data-chip data-flip={it.id} onPointerDown={(e) => startDrag(it.id, e)} title={t("拖到其它列")}
                    style={{ display: "flex", alignItems: "center", gap: 6, cursor: "grab", background: "#fff", border: "1px solid #e4d5af", borderRadius: 10, padding: "6px 8px", fontSize: 13, color: "#2f2413", userSelect: "none", touchAction: "none" }}>
                    <span>{it.icon}</span><span style={{ fontWeight: 600 }}>{t(it.label)}</span>
                  </div>
                ))}
                {colItems[c.where].length === 0 && <div style={{ fontSize: 11, color: "#b0a075", padding: "8px 4px" }}>{t("拖到这里")}</div>}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: "#8a7a54" }}>{t("变更即时生效在你的视图;点「发布」后所有用户生效。「电脑/手机」可分别摆放。")}</div>
      </div>
    </div>,
    document.body
  );
}
