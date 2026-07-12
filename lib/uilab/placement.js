"use client";
// 栏目放置表(第二阶段核心数据层)。按端(desktop/mobile)分别存"每个功能在哪":
// nav(导航栏)/ more(更多菜单)/ morefeatures(更多功能网格)/ zone(分区大模块)/ hidden(隐藏)。
// 用扁平列表建模,天然同时支持"单点"(默认,每项一条)和"多点"(一项多条,第三阶段可开)。
import { useState, useEffect } from "react";

const LS = "kye.items.v1";
export const WHERES = ["nav", "more", "morefeatures", "zone", "hidden"];

// 默认放置(单点)——尽量贴近当前 app 的可达性;仅覆盖"可移动的功能项",原生模块(排行榜/今日任务)仍由布局系统管。
const DESKTOP_DEFAULT = [
  { item: "exams", where: "nav", order: 0 }, { item: "home", where: "nav", order: 1 },
  { item: "materials", where: "nav", order: 2 }, { item: "study", where: "nav", order: 3 },
  { item: "performances", where: "morefeatures", order: 0 }, { item: "inbox", where: "morefeatures", order: 1 },
  { item: "notes", where: "morefeatures", order: 2 }, { item: "mistakes", where: "morefeatures", order: 3 },
  { item: "mock", where: "more", order: 0 }, { item: "prep", where: "more", order: 1 },
  { item: "profile", where: "more", order: 2 }, { item: "checkpoints", where: "more", order: 3 },
  { item: "settings", where: "more", order: 4 }, { item: "feedback", where: "more", order: 5 },
  { item: "admin", where: "more", order: 6 }, { item: "dev", where: "more", order: 7 }, { item: "bugs", where: "more", order: 8 }
];
export function defaultPlacement() {
  return { v: 1, mode: "single", navEdge: "top", navLen: null, desktop: clone(DESKTOP_DEFAULT), mobile: clone(DESKTOP_DEFAULT) };
}

function clone(x) { return JSON.parse(JSON.stringify(x)); }

let S = { loaded: false, working: null, publishedDefault: null };
const subs = new Set();
const emit = () => subs.forEach((f) => f());
function set(patch) { S = { ...S, ...patch }; emit(); }

export function initClient() {
  if (typeof window === "undefined" || S.loaded) return;
  try { const d = JSON.parse(localStorage.getItem(LS) || "null"); S = { ...S, working: d && d.working ? d.working : null, loaded: true }; }
  catch { S = { ...S, loaded: true }; }
  emit();
  fetch("/api/ui-items").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && d.placement) set({ publishedDefault: d.placement }); }).catch(() => {});
}
function persist() { try { localStorage.setItem(LS, JSON.stringify({ working: S.working })); } catch {} }

// 生效的放置表:开发者本地在编辑的 working 优先,否则已发布默认,否则内置默认。
export function placementNow() { return S.working || S.publishedDefault || defaultPlacement(); }
export function active() { return !!(S.working || S.publishedDefault); } // 有本地编辑或已发布才接管渲染;否则回退当前布局
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
export function moveItem(bp, itemId, where, order) {
  const pl = clone(S.working || placementNow());
  if (!pl[bp]) pl[bp] = [];
  if ((pl.mode || "single") === "single") pl[bp] = pl[bp].filter((e) => e.item !== itemId);
  else pl[bp] = pl[bp].filter((e) => !(e.item === itemId && e.where === where));
  const ord = typeof order === "number" ? order : (itemsIn(bp, where, pl).length);
  pl[bp].push({ item: itemId, where, order: ord });
  set({ working: pl }); persist();
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
