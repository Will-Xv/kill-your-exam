// 放置表纯逻辑(无 "use client",前后端共用)。默认值 + 移动算法。
// 客户端 placement.js 与服务端(杀手 UI 砖头)都从这里取,保证同一套规则。
export const WHERES = ["nav", "more", "morefeatures", "zone", "hidden"];
// 固定项:只能在自己所属的容器里【挪位置】,不能挪出去、也不能隐藏/删除。
// 写死在这里(placementCore 无依赖,避免和 items.js 循环引用);items.js 里对应项也标了 pinned。
export const PINNED = { home: "nav", mine: "nav" };

export const DESKTOP_DEFAULT = [
  { item: "leaderboard", where: "zone", order: 0 }, { item: "hero", where: "zone", order: 1 },
  { item: "today", where: "zone", order: 2 }, { item: "strategy", where: "zone", order: 3 },
  { item: "exams", where: "nav", order: 0 }, { item: "home", where: "nav", order: 1 },
  { item: "materials", where: "nav", order: 2 }, { item: "study", where: "nav", order: 3 },
  { item: "mine", where: "nav", order: 4 },
  // 「更多(☰ 菜单)」已取消:原来在 more 里的都并进「更多功能」网格;管理员/开发者项并进「我的」菜单(不进放置表)。
  { item: "performances", where: "morefeatures", order: 0 },
  { item: "notes", where: "morefeatures", order: 1 }, { item: "mistakes", where: "morefeatures", order: 2 },
  { item: "arena", where: "morefeatures", order: 3 },
  { item: "quizupload", where: "morefeatures", order: 4 },
  { item: "mock", where: "morefeatures", order: 5 }, { item: "prep", where: "morefeatures", order: 6 }
];
export function clone(x) { return JSON.parse(JSON.stringify(x)); }
export function defaultPlacement() {
  return { v: 1, mode: "single", navEdge: "top", navLen: null, navDock: { desktop: "top", mobile: "bottom" }, killerHome: { desktop: "dock", mobile: "dock" }, desktop: clone(DESKTOP_DEFAULT), mobile: clone(DESKTOP_DEFAULT) };
}
export const NAV_EDGES = ["top", "bottom", "left", "right"];
export const KILLER_HOMES = ["dock", "float"]; // 杀手只有两态:dock=占大格/常驻大面板,float=像手机一样浮动;绝无 "hidden"
export function killerHomeOf(pl, bp) { const d = pl && pl.killerHome; if (d && KILLER_HOMES.includes(d[bp])) return d[bp]; return "dock"; }
export function navDockOf(pl, bp) { const d = pl && pl.navDock; if (d && NAV_EDGES.includes(d[bp])) return d[bp]; return bp === "desktop" ? "top" : "bottom"; }
export function itemsInOf(bp, where, pl) {
  return (pl[bp] || []).filter((e) => e.where === where).sort((a, b) => a.order - b.order);
}
export function placementOfIn(bp, itemId, pl) {
  return (pl[bp] || []).filter((e) => e.item === itemId);
}
// 纯函数:把某项移到某容器某位置,返回新放置表(单点模式先移除该项在该端别处)。
export function applyMove(placement, bp, itemId, where, index) {
  if (where === "more") where = "morefeatures"; // 「更多☰」已取消,统一落到「更多功能」
  // 固定项(首页、我的)只能在自己的容器里换位置,挪去别处/隐藏一律忽略
  if (PINNED[itemId] && where !== PINNED[itemId]) return clone(placement);
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

// 让【注册表里存在、但某份放置表里完全缺失(=保存这份布局时该功能还不存在)】的项自动补进来,
// 避免"新加的功能在旧布局/旧的按考试覆盖里永远看不到"。桶位优先取参考表(通常是已发布默认)里的位置,
// 否则取内置默认;标为 hidden 的(用户主动隐藏)不动。绝不移动/删除已有项。
export function normalizePlacement(pl, allItemIds, refPl) {
  if (!pl || !Array.isArray(allItemIds)) return pl;
  const out = clone(pl);
  for (const bp of ["desktop", "mobile"]) {
    const arr = out[bp] || (out[bp] = []);
    const present = new Set(arr.map((e) => e.item));
    for (const id of allItemIds) {
      if (present.has(id)) continue;                       // 已在表里(含被主动隐藏)→ 不动
      let where = null;
      const ref = refPl && (refPl[bp] || []).find((e) => e.item === id);
      if (ref) where = ref.where;
      else { const d = DESKTOP_DEFAULT.find((e) => e.item === id); if (d) where = d.where; }
      if (!where) continue;                                // 注册表未知默认位置 → 跳过,不硬塞
      // 尽量【继承参考表/内置默认的原有次序】,别把已有项按注册表顺序重排(遵守最小改动)。
      let order;
      if (ref) order = ref.order;
      else { const d = DESKTOP_DEFAULT.find((e) => e.item === id); order = d ? d.order : arr.filter((e) => e.where === where).reduce((m, e) => Math.max(m, e.order), -1) + 1; }
      arr.push({ item: id, where, order });
    }
  }
  return out;
}
