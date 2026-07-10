"use client";
import { useState, useEffect } from "react";

// 开发者布局实验室:一个客户端单例响应式 store。首页编辑器和全局的杀手卡片都订阅它,
// 于是同一个「编辑模式」既能拖首页的块,也能拖/缩放杀手卡片。纯前端 + localStorage,与砖头/AI 无关。
const LS_KEY = "kye.uilab.v1";
let S = { enabled: false, isDesktop: false, editing: false, activeId: null, presets: [], working: null, natural: null, past: [], future: [], loaded: false };
const subs = new Set();
const clone = (o) => JSON.parse(JSON.stringify(o || {}));
function emit() { subs.forEach((f) => f()); }
function set(patch) { S = { ...S, ...patch }; emit(); }

export function subscribe(f) { subs.add(f); return () => subs.delete(f); }
export function snap() { return S; }

function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify({ activeId: S.activeId, presets: S.presets })); } catch {} }
export function initClient() {
  if (typeof window === "undefined" || S.loaded) return;
  try { const d = JSON.parse(localStorage.getItem(LS_KEY) || "") || {}; S = { ...S, activeId: d.activeId || null, presets: d.presets || [], loaded: true }; }
  catch { S = { ...S, loaded: true }; }
  emit();
}
export function setEnabled(v) { if (S.enabled !== !!v) set({ enabled: !!v }); }
export function setDesktop(v) { if (S.isDesktop !== !!v) set({ isDesktop: !!v }); }

export function activePreset() { return S.presets.find((p) => p.id === S.activeId) || null; }
function appliedLayout() { const p = activePreset(); return (!S.editing && S.enabled && S.isDesktop && p) ? p.layout : null; }
// 当前生效的布局对象(编辑中=working;否则=已套用的布局;都没有则 null 表示自然流)
export function layoutNow() { return S.editing ? (S.working || {}) : appliedLayout(); }

export function enterEdit(seeds) { const p = activePreset(); const nat = seeds || {}; set({ editing: true, natural: nat, working: p ? clone(p.layout) : clone(nat), past: [], future: [] }); }
export function exitEdit() { if (S.editing) set({ editing: false }); }
export function seed(id, val) { if (S.working && S.working[id] == null) { S.working = { ...S.working, [id]: val }; emit(); } }
export function seedMany(obj) { if (!S.working) return; let ch = false; const w = { ...S.working }; for (const k in obj) { if (w[k] == null) { w[k] = obj[k]; ch = true; } } if (ch) { S.working = w; emit(); } }
export function pushHistory() { if (S.working) set({ past: [...S.past.slice(-59), clone(S.working)], future: [] }); }
export function setPos(id, patch) { if (!S.working) return; S.working = { ...S.working, [id]: { ...S.working[id], ...patch } }; emit(); }
export function undo() { if (!S.past.length) return; set({ future: [clone(S.working), ...S.future], working: S.past[S.past.length - 1], past: S.past.slice(0, -1) }); }
export function redo() { if (!S.future.length) return; set({ past: [...S.past, clone(S.working)], working: S.future[0], future: S.future.slice(1) }); }
export function resetNatural() { set({ past: [...S.past, clone(S.working || {})], future: [], working: clone(S.natural || {}) }); } // 回到进入编辑时的原始排版

export function savePreset(name) {
  const id = "L" + Date.now().toString(36);
  const layout = clone(S.working || appliedLayout() || {});
  set({ activeId: id, presets: [...S.presets, { id, name, ts: Date.now(), layout }] }); persist();
}
export function overwriteActive() { const p = activePreset(); if (!p) return; set({ presets: S.presets.map((x) => x.id === p.id ? { ...x, layout: clone(S.working), ts: Date.now() } : x) }); persist(); }
export function applyPreset(id) { set({ activeId: id, editing: false }); persist(); }
export function deletePreset(id) { set({ activeId: S.activeId === id ? null : S.activeId, presets: S.presets.filter((p) => p.id !== id) }); persist(); }
export function revertActive() { set({ activeId: null }); persist(); }

export function useUiLab() {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force((n) => n + 1)), []);
  return S;
}
