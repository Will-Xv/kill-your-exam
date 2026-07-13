// 放置表纯逻辑(无 "use client",前后端共用)。默认值 + 移动算法。
// 客户端 placement.js 与服务端(杀手 UI 砖头)都从这里取,保证同一套规则。
export const WHERES = ["nav", "more", "morefeatures", "zone", "hidden"];

const DESKTOP_DEFAULT = [
  { item: "leaderboard", where: "zone", order: 0 }, { item: "hero", where: "zone", order: 1 },
  { item: "today", where: "zone", order: 2 }, { item: "strategy", where: "zone", order: 3 },
  { item: "exams", where: "nav", order: 0 }, { item: "home", where: "nav", order: 1 },
  { item: "materials", where: "nav", order: 2 }, { item: "study", where: "nav", order: 3 },
  { item: "performances", where: "morefeatures", order: 0 }, { item: "inbox", where: "morefeatures", order: 1 },
  { item: "notes", where: "morefeatures", order: 2 }, { item: "mistakes", where: "morefeatures", order: 3 },
  { item: "mock", where: "more", order: 0 }, { item: "prep", where: "more", order: 1 },
  { item: "profile", where: "more", order: 2 }, { item: "checkpoints", where: "more", order: 3 },
  { item: "settings", where: "more", order: 4 }, { item: "feedback", where: "more", order: 5 },
  { item: "admin", where: "more", order: 6 }, { item: "dev", where: "more", order: 7 }, { item: "bugs", where: "more", order: 8 }
];
export function clone(x) { return JSON.parse(JSON.stringify(x)); }
export function defaultPlacement() {
  return { v: 1, mode: "single", navEdge: "top", navLen: null, navDock: { desktop: "top", mobile: "bottom" }, desktop: clone(DESKTOP_DEFAULT), mobile: clone(DESKTOP_DEFAULT) };
}
export function navDockOf(pl, bp) { const d = pl && pl.navDock; if (d && (d[bp] === "top" || d[bp] === "bottom")) return d[bp]; return bp === "desktop" ? "top" : "bottom"; }
export function itemsInOf(bp, where, pl) {
  return (pl[bp] || []).filter((e) => e.where === where).sort((a, b) => a.order - b.order);
}
export function placementOfIn(bp, itemId, pl) {
  return (pl[bp] || []).filter((e) => e.item === itemId);
}
// 纯函数:把某项移到某容器某位置,返回新放置表(单点模式先移除该项在该端别处)。
export function applyMove(placement, bp, itemId, where, index) {
  const pl = clone(placement);
  if (!pl[bp]) pl[bp] = [];
  const mode = pl.mode || "single";
  if (mode === "single") pl[bp] = pl[bp].filter((e) => e.item !== itemId);
  else pl[bp] = pl[bp].filter((e) => !(e.item === itemId && e.where === where));
  const inCol = pl[bp].filter((e) => e.where === where).sort((a, b) => a.order - b.order);
  const idx = typeof index === "number" ? Math.max(0, Math.min(index, inCol.length)) : inCol.length;
  inCol.splice(idx, 0, { item: itemId, where, order: 0 });
  inCol.forEach((e, i) => { e.order = i; });
  pl[bp] = [...pl[bp].filter((e) => e.where !== where), ...inCol];
  return pl;
}
