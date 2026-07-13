"use client";
// 全局"打开杀手"开关:当杀手被最小化成导航栏/更多/更多功能里的入口按钮时,点按钮就用它把杀手全屏抽屉打开。
import { useState, useEffect } from "react";
let open = false;
const subs = new Set();
const emit = () => subs.forEach((f) => f());
export function openKiller() { open = true; emit(); }
export function closeKiller() { open = false; emit(); }
export function useKillerOpen() {
  const [, f] = useState(0);
  useEffect(() => { const cb = () => f((n) => n + 1); subs.add(cb); return () => subs.delete(cb); }, []);
  return open;
}
