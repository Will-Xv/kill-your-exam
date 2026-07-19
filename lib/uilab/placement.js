"use client";
// 栏目放置表(第二阶段核心数据层)。按端(desktop/mobile)分别存"每个功能在哪":
// nav(导航栏)/ more(更多菜单)/ morefeatures(更多功能网格)/ zone(分区大模块)/ hidden(隐藏)。
// 用扁平列表建模,天然同时支持"单点"(默认,每项一条)和"多点"(一项多条,第三阶段可开)。
import { useState, useEffect } from "react";
import { WHERES, defaultPlacement, clone, applyMove, navDockOf, killerHomeOf, normalizePlacement } from "@/lib/uilab/placementCore";
import { setCustomItems, allItems } from "@/lib/uilab/items";
export { WHERES, defaultPlacement, navDockOf, killerHomeOf };

const LS = "kye.items.v1";

let S = { loaded: false, working: null, publishedDefault: null, examPlacement: null, canPublish: false };
const subs = new Set();
const emit = () => subs.forEach((f) => f());
function set(patch) { S = { ...S, ...patch }; emit(); }
// 收到服务端布局:先装载自定义项,再把「注册表里有但布局里缺失的新功能」补进来(按考试覆盖以已发布默认为参考桶位)。
function applyServerPlacement(d) {
  try { setCustomItems(d.customItems || []); } catch {}
  let ids = []; try { ids = allItems().map((i) => i.id); } catch {}
  const pub = d.placement ? normalizePlacement(d.placement, ids, null) : null;
  const examP = d.examPlacement ? normalizePlacement(d.examPlacement, ids, d.placement || null) : null;
  set({ publishedDefault: pub, examPlacement: examP, canPublish: !!d.canPublish });
}

export function initClient() {
  if (typeof window === "undefined" || S.loaded) return;
  try { const d = JSON.parse(localStorage.getItem(LS) || "null"); S = { ...S, working: d && d.working ? d.working : null, loaded: true }; }
  catch { S = { ...S, loaded: true }; }
  emit();
  fetch("/api/ui-items").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { applyServerPlacement(d); } }).catch(() => {});
}
export function refreshServer() { // 强制从服务端重新拉取放置表(绕过 initClient 的 loaded 单次守卫),用于手动改导航栏后即时刷新
  if (typeof window === "undefined") return;
  fetch("/api/ui-items").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { applyServerPlacement(d); } }).catch(() => {});
}
function persist() { try { localStorage.setItem(LS, JSON.stringify({ working: S.working })); } catch {} }

// 生效的放置表:开发者本地在编辑的 working 优先,否则已发布默认,否则内置默认。
export function placementNow() { return S.working || S.examPlacement || S.publishedDefault || defaultPlacement(); } // 补上 examPlacement:栏目分配面板要从【本考试实际生效】的放置起步,才和界面渲染(renderPlacement)一致
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
  try { fetch("/api/ui-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placement: p, scope: "global" }) }).then(() => set({ publishedDefault: clone(p) })); } catch {}
}
export function unpublish() {
  try { fetch("/api/ui-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placement: null, scope: "global" }) }).then(() => set({ publishedDefault: null })); } catch {}
}
// 应用到【当前考试】(所有用户可用):把当前编辑草稿存为本考试的布局覆盖。
export function applyToExam() {
  const p = S.working || placementNow();
  set({ working: null }); persist();                 // 先清掉本地草稿并落盘,避免旧草稿残留在编辑器
  try { fetch("/api/ui-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placement: p, scope: "exam" }) }).then(() => set({ examPlacement: clone(p) })); } catch {}
}
// 重置当前考试的布局覆盖(回到全局默认)。
export function resetExam() {
  try { fetch("/api/ui-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placement: null, scope: "exam" }) }).then(() => set({ examPlacement: null })); } catch {}
}

