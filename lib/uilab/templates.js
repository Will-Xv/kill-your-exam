// 首页分区模板:每个模板= 一组分区(zone)+ CSS Grid 布局。分区内的栏目竖向流排列(高度随内容)。
export const TEMPLATES = {
  single:  { label: "整列",            zones: ["a"],                gridTemplateColumns: "1fr",     gridTemplateAreas: '"a"' },
  lr:      { label: "左右",            zones: ["a", "b"],           gridTemplateColumns: "1fr 1fr", gridTemplateAreas: '"a b"' },
  tb:      { label: "上下",            zones: ["a", "b"],           gridTemplateColumns: "1fr",     gridTemplateAreas: '"a" "b"' },
  quad:    { label: "四格",            zones: ["a", "b", "c", "d"], gridTemplateColumns: "1fr 1fr", gridTemplateAreas: '"a b" "c d"' },
  lsplit_r:{ label: "左分上下·右整条",  zones: ["a", "b", "c"],      gridTemplateColumns: "1fr 1fr", gridTemplateAreas: '"a c" "b c"' },
  l_rsplit:{ label: "左整条·右分上下",  zones: ["a", "b", "c"],      gridTemplateColumns: "1fr 1fr", gridTemplateAreas: '"a b" "a c"' },
  t_bsplit:{ label: "上分左右·下整条",  zones: ["a", "b", "c"],      gridTemplateColumns: "1fr 1fr", gridTemplateAreas: '"a b" "c c"' },
  tfull_bsplit:{ label: "上整条·下分左右", zones: ["a", "b", "c"],   gridTemplateColumns: "1fr 1fr", gridTemplateAreas: '"a a" "b c"' },
};
export const TEMPLATE_ORDER = ["single", "lr", "tb", "quad", "lsplit_r", "l_rsplit", "t_bsplit", "tfull_bsplit"];

export function templateZones(t) { return (TEMPLATES[t] || TEMPLATES.single).zones; }

// 保证布局是合法 v2:模板存在、每个分区有数组、所有 ids 恰好各归一处(缺的塞进第一个分区、多余的去掉)
export function normalizeLayout(layout, ids) {
  const t = (layout && TEMPLATES[layout.template]) ? layout.template : "single";
  const zoneIds = templateZones(t);
  const zones = {};
  for (const z of zoneIds) zones[z] = [];
  const seen = new Set();
  const src = (layout && layout.zones) || {};
  // 先按原分区放置(只保留仍存在的分区),被删掉分区里的项稍后归拢到第一个分区
  for (const z of zoneIds) {
    for (const id of (src[z] || [])) { if (ids.includes(id) && !seen.has(id)) { zones[z].push(id); seen.add(id); } }
  }
  // 原布局里位于"已不存在分区"的项 → 收拢到第一个分区
  for (const z in src) { if (!zoneIds.includes(z)) { for (const id of src[z]) { if (ids.includes(id) && !seen.has(id)) { zones[zoneIds[0]].push(id); seen.add(id); } } } }
  // 尚未安置的新项(如某考试才出现的提醒)→ 第一个分区末尾
  for (const id of ids) { if (!seen.has(id)) { zones[zoneIds[0]].push(id); seen.add(id); } }
  return { v: 2, template: t, zones, __killer: (layout && layout.__killer) || null, __nav: (layout && layout.__nav) || null };
}
