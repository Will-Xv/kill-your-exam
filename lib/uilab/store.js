"use client";
import { useState, useEffect } from "react";
import { normalizeLayout, templateZones } from "@/lib/uilab/templates";

// 开发者布局实验室(v2:分区模板 + 竖向流)。内容框放进分区、竖向排列、高度随内容;
// 杀手卡片/导航栏仍是浮动元素(单独定位)。纯前端 + localStorage,与砖头/AI 无关。
const LS_KEY = "kye.uilab.v1";
let S = { enabled: false, isDesktop: false, editing: false, activeId: null, presets: [], working: null, natural: null, lastReverted: null, guides: [], drop: null, publishedDefault: null, past: [], future: [], loaded: false };
const subs = new Set();
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
function emit() { subs.forEach((f) => f()); }
function set(patch) { S = { ...S, ...patch }; emit(); }
const allIds = (lay) => { const out = []; const z = (lay && lay.zones) || {}; for (const k in z) for (const id of z[k]) out.push(id); return out; };

export function subscribe(f) { subs.add(f); return () => subs.delete(f); }
export function snap() { return S; }

function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify({ activeId: S.activeId, presets: S.presets })); } catch {} }
export function initClient() {
  if (typeof window === "undefined" || S.loaded) return;
  try { const d = JSON.parse(localStorage.getItem(LS_KEY) || "") || {}; S = { ...S, activeId: d.activeId || null, presets: d.presets || [], loaded: true }; }
  catch { S = { ...S, loaded: true }; }
  emit();
  fetch("/api/ui-layout").then((r) => r.ok ? r.json() : null).then((d) => { if (d && d.layout) { S = { ...S, publishedDefault: d.layout }; emit(); } }).catch(() => {});
}
export function setEnabled(v) { if (S.enabled !== !!v) set({ enabled: !!v }); }
export function setDesktop(v) { if (S.isDesktop !== !!v) set({ isDesktop: !!v }); }

export function activePreset() { return S.presets.find((p) => p.id === S.activeId) || null; }
function appliedLayout() {
  if (S.editing) return null;
  const p = activePreset();
  if (S.enabled && p) return p.layout;               // 开发者本地在用的布局优先
  if (S.publishedDefault) return S.publishedDefault;  // 已发布的全站默认(所有用户)
  return null;
}
// 只有 v2 布局才驱动内容分区(旧的绝对布局忽略,避免乱)
function appliedContent() { const l = appliedLayout(); return (l && l.v === 2) ? l : null; }
export function hasHomeLayout() { return (S.editing && S.enabled) || !!appliedContent(); }
export function appliedKiller() { const l = appliedLayout(); return (l && l.__killer) || null; }
export function appliedNav() { const l = appliedLayout(); return (l && l.__nav) || null; }
// 当前生效的布局(编辑中=working;否则=已套用的)。killer/nav 在非桌面也可读位置。
export function layoutNow() { return S.editing ? (S.working || null) : appliedLayout(); }
// 内容分区布局:编辑中=working;否则=已套用的 v2 布局(桌面网格 / 手机单列都用它)
export function contentToRender() {
  if (S.editing && S.enabled) return S.working;
  const l = appliedLayout();
  return (l && l.v === 2) ? l : null;
}

export function enterEdit(ids) {
  const p = activePreset();
  const base = (p && p.layout) ? p.layout : null;
  const working = normalizeLayout(base && base.v === 2 ? base : { __killer: base && base.__killer, __nav: base && base.__nav }, ids || []);
  set({ editing: true, working, natural: clone(working), past: [], future: [] });
}
export function exitEdit() { if (S.editing) set({ editing: false }); }
export function pushHistory() { if (S.working) set({ past: [...S.past.slice(-59), clone(S.working)], future: [] }); }
export function seed(id, val) { if (S.working && S.working[id] == null) { S.working = { ...S.working, [id]: val }; emit(); } }
export function setPos(id, patch) { if (!S.working) return; S.working = { ...S.working, [id]: { ...S.working[id], ...patch } }; emit(); } // 杀手/导航栏浮动定位
export function setGuides(g) { if ((g.length === 0) && (S.guides.length === 0)) return; S.guides = g; emit(); }
export function setDrop(d) { S.drop = d; emit(); }

export function setTemplate(t) { if (!S.working) return; pushHistory(); const w = normalizeLayout({ ...S.working, template: t }, allIds(S.working)); S.working = w; emit(); }
export function moveItem(id, zone, index) {
  if (!S.working) return;
  const zones = {}; for (const z in S.working.zones) zones[z] = S.working.zones[z].filter((x) => x !== id);
  if (!zones[zone]) zones[zone] = [];
  const idx = Math.max(0, Math.min(index, zones[zone].length));
  zones[zone].splice(idx, 0, id);
  S.working = { ...S.working, zones }; emit();
}

export function undo() { if (!S.past.length) return; set({ future: [clone(S.working), ...S.future], working: S.past[S.past.length - 1], past: S.past.slice(0, -1) }); }
export function redo() { if (!S.future.length) return; set({ past: [...S.past, clone(S.working)], working: S.future[0], future: S.future.slice(1) }); }
export function resetNatural() { set({ past: [...S.past, clone(S.working)], future: [], working: clone(S.natural) }); }

export function reapplyReverted() { if (S.lastReverted && S.presets.some((p) => p.id === S.lastReverted)) { set({ activeId: S.lastReverted, lastReverted: null }); persist(); } }
export function savePreset(name) {
  const id = "L" + Date.now().toString(36);
  const layout = clone(S.working || appliedLayout() || {});
  set({ activeId: id, presets: [...S.presets, { id, name, ts: Date.now(), layout }], lastReverted: null }); persist();
}
export function overwriteActive() { const p = activePreset(); if (!p) return; set({ presets: S.presets.map((x) => x.id === p.id ? { ...x, layout: clone(S.working), ts: Date.now() } : x) }); persist(); }
export function applyPreset(id) { set({ activeId: id, editing: false, lastReverted: null }); persist(); }
export function deletePreset(id) { set({ activeId: S.activeId === id ? null : S.activeId, presets: S.presets.filter((p) => p.id !== id) }); persist(); }
export function revertActive() { set({ activeId: null, lastReverted: S.activeId }); persist(); }

export function publishDefault() {
  const layout = S.working || (activePreset() ? activePreset().layout : null) || S.publishedDefault;
  if (!layout) return Promise.resolve(false);
  S.publishedDefault = clone(layout); emit();
  return fetch("/api/ui-layout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout }) }).then((r) => r.ok).catch(() => false);
}
export function unpublishDefault() {
  S.publishedDefault = null; emit();
  return fetch("/api/ui-layout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout: null }) }).then((r) => r.ok).catch(() => false);
}

export function useUiLab() {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force((n) => n + 1)), []);
  return S;
}
