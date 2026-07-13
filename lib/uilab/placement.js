"use client";
// 栏目放置表(第二阶段核心数据层)。按端(desktop/mobile)分别存"每个功能在哪":
// nav(导航栏)/ more(更多菜单)/ morefeatures(更多功能网格)/ zone(分区大模块)/ hidden(隐藏)。
// 用扁平列表建模,天然同时支持"单点"(默认,每项一条)和"多点"(一项多条,第三阶段可开)。
import { useState, useEffect } from "react";
import { WHERES, defaultPlacement, clone, applyMove, navDockOf } from "@/lib/uilab/placementCore";
import { setCustomItems } from "@/lib/uilab/items";
export { WHERES, defaultPlacement, navDockOf };

const LS = "kye.items.v1";

let S = { loaded: false, working: null, publishedDefault: null, examPlacement: null };
const subs = new Set();
const emit = () => subs.forEach((f) => f());
function set(patch) { S = { ...S, ...patch }; emit(); }

export function initClient() {
  if (typeof window === "undefined" || S.loaded) return;
  try { const d = JSON.parse(localStorage.getItem(LS) || "null"); S = { ...S, working: d && d.working ? d.working : null, loaded: true }; }
  catch { S = { ...S, loaded: true }; }
  emit();
  fetch("/api/ui-items").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { try { setCustomItems(d.customItems || []); } catch {} set({ publishedDefault: d.placement || null, examPlacement: d.examPlacement || null }); } }).catch(() => {});
}
function persist() { try { localStorage.setItem(LS, JSON.stringify({ working: S.working })); } catch {} }

// 生效的放置表:开发者本地在编辑的 working 优先,否则已发布默认,否则内置默认。
export function placementNow() { return S.working || S.publishedDefault || defaultPlacement(); }
export function active() { return !!(S.examPlacement || S.publishedDefault); } // 本考试覆盖 或 已发布默认 才接管实时渲染;草稿(working)只在板子里预览
export function renderPlacement() { return S.examPlacement || S.publishedDefault || null; } // 本考试覆盖优先,否则已发布默认
export function seedPublished(p) { if (p && !S.publishedDefault) S.publishedDefault = p; }

// 读:某端某容器里的项(按 order 排)。
export function itemsIn(bp, where, p) {
  const pl = p || placementNow();
  return (pl[bp] || []).filter((e) => e.where === where).sort((a, b) => a.order - b.order);
}
export function placementOf(bp, itemId, p) {
  const pl = p || placementNow();
  return (pl[bp] || []).filter((e) => e.item === itemId);
}

// 写(编辑器用):把某项移到某容器。单点模式下先移除该项在该端的其它位置。
export function moveItem(bp, itemId, where, index) {
  set({ working: applyMove(S.working || placementNow(), bp, itemId, where, index) }); persist();
}
export function setMode(mode) { const pl = clone(S.working || placementNow()); pl.mode = mode; set({ working: pl }); persist(); }
export function setNav(patch) { const pl = clone(S.working || placementNow()); Object.assign(pl, patch); set({ working: pl }); persist(); }
export function resetWorking() { set({ working: null }); persist(); }
export function startEditFromCurrent() { set({ working: clone(placementNow()) }); persist(); }

export function useItems() {
  const [, f] = useState(0);
  useEffect(() => { initClient(); const cb = () => f((n) => n + 1); subs.add(cb); return () => subs.delete(cb); }, []);
  return S;
}
export function snap() { return S; }
export function publish() {
  const p = S.working || placementNow();
  try { fetch("/api/ui-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placement: p }) }).then(() => set({ publishedDefault: clone(p) })); } catch {}
}
export function unpublish() {
  try { fetch("/api/ui-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placement: null }) }).then(() => set({ publishedDefault: null })); } catch {}
}

