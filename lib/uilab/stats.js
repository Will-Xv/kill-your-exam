"use client";
// 栏目实时数字/徽标提供者。一次拉取、缓存、订阅;给富模块的数字 + 容器徽标透传共用。
import { useState, useEffect } from "react";

// 数据源:key -> { api, pick(响应)->number, suffix(数字后缀), verb(动作按钮文案) }
const SOURCES = {
  inboxUnread: { api: "/api/inbox", pick: (d) => d.unread || 0, suffix: "条未读", verb: "查看收件箱" }
  // 后续可加:mistakesDue、mockCount 等
};

let values = {};              // key -> number
const subs = new Set();
let started = false;
const emit = () => subs.forEach((f) => f());

async function loadAll() {
  const keys = Object.keys(SOURCES);
  await Promise.all(keys.map(async (key) => {
    try {
      const d = await fetch(SOURCES[key].api).then((r) => (r.ok ? r.json() : null));
      if (d) { values = { ...values, [key]: SOURCES[key].pick(d) }; }
    } catch {}
  }));
  emit();
}

export function startStats() {
  if (started || typeof window === "undefined") return;
  started = true;
  loadAll();
  setInterval(loadAll, 60000);
}
export function statValue(key) { return key ? values[key] : undefined; }
export function statMeta(key) { return (key && SOURCES[key]) || null; }

// 订阅所有实时值(任一变化即重渲染)。组件用它拿最新徽标/数字。
export function useStats() {
  const [, f] = useState(0);
  useEffect(() => { startStats(); const cb = () => f((n) => n + 1); subs.add(cb); return () => subs.delete(cb); }, []);
  return values;
}
