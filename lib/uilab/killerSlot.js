"use client";
import { useState, useEffect, useRef } from "react";

// 唯一杀手实例的"槽位"注册:当前页面在它那一格渲染一个 <KillerSlot/> 空槽,
// AppShell 用 portal 把唯一的 KillerChat 搬进当前槽位 —— 切页面时杀手不重挂、不掉聊天。
let slotEl = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());
export function setKillerSlot(el) { if (slotEl !== el) { slotEl = el; emit(); } }
export function clearKillerSlot(el) { if (slotEl === el) { slotEl = null; emit(); } }
export function useKillerSlot() {
  const [, f] = useState(0);
  useEffect(() => { const cb = () => f((n) => n + 1); subs.add(cb); return () => subs.delete(cb); }, []);
  return slotEl;
}
export function KillerSlot() {
  const ref = useRef(null);
  useEffect(() => { const el = ref.current; setKillerSlot(el); return () => clearKillerSlot(el); }, []);
  return <div ref={ref} style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", minHeight: 0 }} />;
}
