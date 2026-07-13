// 按考试的首页布局(杀手能改、不发布)。核心只有:模板 + 杀手占哪一格;其余格子由 RouteShell 合并成内容区。
// 【杀手不许隐藏】:布局里必须始终有一格是杀手;clear 掉则回到默认(浮动杀手仍在)。绝不产生"没有杀手"的布局。
import { getSetting } from "@/lib/db";
import { TEMPLATES } from "@/lib/uilab/templates";
import { recordSet } from "@/lib/uiPlacement";

const layoutKey = (examId) => "ui_layout:" + examId;

// 每个模板每一格的位置说明(给杀手理解"移到哪")
export const ZONE_POS = {
  single: { a: "整页" },
  lr: { a: "左", b: "右" },
  tb: { a: "上", b: "下" },
  quad: { a: "左上", b: "右上", c: "左下", d: "右下" },
  lsplit_r: { a: "左上", b: "左下", c: "右整条" },
  l_rsplit: { a: "左整条", b: "右上", c: "右下" },
  t_bsplit: { a: "左上", b: "右上", c: "下整条" },
  tfull_bsplit: { a: "上整条", b: "左下", c: "右下" },
};

export function getExamLayout(examId) {
  try { const v = getSetting(layoutKey(examId), ""); return v ? JSON.parse(v) : null; } catch { return null; }
}

function zonesOf(template) { return (TEMPLATES[template] || TEMPLATES.lr).zones; }

// 找出布局里杀手所在的格子
export function killerZoneOf(layout) {
  if (!layout || !layout.zones) return null;
  for (const z of Object.keys(layout.zones)) if ((layout.zones[z] || []).includes("__killer")) return z;
  return null;
}

// 构造一个合法布局:指定模板 + 杀手格;其余格子留空(内容由 RouteShell 填)
export function buildLayout(template, killerZone) {
  const tpl = TEMPLATES[template] ? template : "lr";
  const zoneIds = zonesOf(tpl);
  const kz = zoneIds.includes(killerZone) ? killerZone : zoneIds[zoneIds.length - 1]; // 默认最后一格(通常是右/下)
  const zones = {};
  for (const z of zoneIds) zones[z] = [];
  zones[kz] = ["__killer"]; // 【必须有杀手】
  return { v: 2, template: tpl, zones, __killer: null, __nav: null, scrollbar: false };
}

// 读:当前生效的首页布局概况(本考试覆盖优先)
export function readHomeLayout(examId) {
  const l = getExamLayout(examId);
  const templates = Object.keys(TEMPLATES).map((t) => ({ template: t, zones: zonesOf(t).map((z) => ({ zone: z, pos: (ZONE_POS[t] || {})[z] || z })) }));
  if (!l) return { applied: false, note: "本考试没有自定义首页布局,杀手当前是右侧常驻/手机浮动。", templates };
  const kz = killerZoneOf(l);
  return { applied: true, template: l.template, killerZone: kz, killerPos: (ZONE_POS[l.template] || {})[kz] || kz, templates };
}

// 设:模板 + 杀手格。强制杀手必须在某一格(不许隐藏)。可撤销。
export function setHomeLayout(examId, userId, { template, killerZone }) {
  const layout = buildLayout(template, killerZone);
  const kz = killerZoneOf(layout);
  if (!kz) return null; // 理论不会发生;保险:没有杀手格就拒绝
  recordSet(examId, userId, layoutKey(examId), layout, `home layout ${layout.template}/killer@${kz}`);
  return { template: layout.template, killerZone: kz, killerPos: (ZONE_POS[layout.template] || {})[kz] || kz };
}

// 清:回到默认(无自定义布局)。杀手回到浮动常驻,依然可见。
export function clearHomeLayout(examId, userId) {
  recordSet(examId, userId, layoutKey(examId), null, "home layout -> default");
  return true;
}
