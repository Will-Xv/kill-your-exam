// 服务端:按考试(per-exam)的功能放置表 + 改动历史(可撤销/可迁移)。杀手的 UI 写砖头用它。
// 仅开发者账号会写(灰度);普通用户没有 per-exam 覆盖,渲染回退到全局默认,行为不变。
import db, { getSetting, setSetting } from "@/lib/db";
import { defaultPlacement, applyMove } from "@/lib/uilab/placementCore";

const key = (examId) => "ui_placement:" + examId;
function ensureEvents() { try { db.exec(`CREATE TABLE IF NOT EXISTS ui_events (id INTEGER PRIMARY KEY, exam_id INTEGER, user_id INTEGER, summary TEXT, before_json TEXT, after_json TEXT, undone INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`); } catch {} try { db.exec("ALTER TABLE ui_events ADD COLUMN skey TEXT"); } catch {} }
// 通用:记一次可撤销的设置改动(before/after + 该设置的 key),供放置表和首页布局共用。
export function recordSet(examId, userId, skey, value, summary) {
  ensureEvents();
  const before = getSetting(skey, "") || "";
  if (value == null) { try { db.prepare("DELETE FROM settings WHERE key=?").run(skey); } catch {} }
  else setSetting(skey, JSON.stringify(value));
  try { db.prepare("INSERT INTO ui_events(exam_id,user_id,skey,summary,before_json,after_json) VALUES(?,?,?,?,?,?)").run(examId, userId, skey, summary || "", before, value == null ? "" : JSON.stringify(value)); } catch {}
}

export function getExamPlacement(examId) { try { const v = getSetting(key(examId), ""); return v ? JSON.parse(v) : null; } catch { return null; } }
// 基准放置表:本考试覆盖 > 全局已发布 > 内置默认。杀手改 UI 从这个基准出发。
export function basePlacement(examId) {
  const ex = getExamPlacement(examId); if (ex) return ex;
  try { const g = getSetting("ui_item_placement", ""); if (g) return JSON.parse(g); } catch {}
  return defaultPlacement();
}
export function setExamPlacement(examId, userId, placement, summary) {
  recordSet(examId, userId, key(examId), placement, summary);
}
// 杀手移动一个功能(默认电脑+手机一致;传 breakpoint 则只改该端)。记历史、可撤销。
// 杀手/编辑器改导航栏停靠边(top/bottom),默认电脑+手机一致;传 breakpoint 则只改该端。记历史、可撤销。
export function setKillerHome(examId, userId, mode, breakpoint) { // 杀手去处:dock/nav/more/morefeatures;绝不 hidden
  const m = ["dock", "float"].includes(mode) ? mode : null;
  if (!m) return null;
  const pl = basePlacement(examId);
  pl.killerHome = pl.killerHome && typeof pl.killerHome === "object" ? { ...pl.killerHome } : { desktop: "dock", mobile: "dock" };
  const bps = breakpoint === "desktop" || breakpoint === "mobile" ? [breakpoint] : ["desktop", "mobile"];
  for (const b of bps) pl.killerHome[b] = m;
  setExamPlacement(examId, userId, pl, `killer home -> ${m}${breakpoint ? "(" + breakpoint + ")" : ""}`);
  return pl.killerHome;
}
export function setNavDock(examId, userId, edge, breakpoint) {
  const e = ["top", "bottom", "left", "right"].includes(edge) ? edge : null;
  if (!e) return null;
  const pl = basePlacement(examId);
  pl.navDock = pl.navDock && typeof pl.navDock === "object" ? { ...pl.navDock } : { desktop: "top", mobile: "bottom" };
  const bps = breakpoint === "desktop" || breakpoint === "mobile" ? [breakpoint] : ["desktop", "mobile"];
  for (const b of bps) pl.navDock[b] = e;
  setExamPlacement(examId, userId, pl, `nav dock → ${e}${breakpoint ? "(" + breakpoint + ")" : "(desktop+mobile)"}`);
  return pl.navDock;
}
export function moveFeature(examId, userId, { featureId, where, breakpoint, index }) {
  let pl = basePlacement(examId);
  const bps = breakpoint === "desktop" || breakpoint === "mobile" ? [breakpoint] : ["desktop", "mobile"];
  for (const b of bps) pl = applyMove(pl, b, featureId, where, typeof index === "number" ? index : undefined);
  setExamPlacement(examId, userId, pl, `move ${featureId} → ${where}${breakpoint ? "(" + breakpoint + ")" : "(desktop+mobile)"}`);
  return pl;
}
export function undoExamUi(examId) {
  ensureEvents();
  const ev = db.prepare("SELECT * FROM ui_events WHERE exam_id=? AND undone=0 ORDER BY id DESC LIMIT 1").get(examId);
  if (!ev) return null;
  const sk = ev.skey || key(examId); // 老记录没有 skey 时按放置表 key 还原
  if (ev.before_json) setSetting(sk, ev.before_json); else { try { db.prepare("DELETE FROM settings WHERE key=?").run(sk); } catch {} }
  db.prepare("UPDATE ui_events SET undone=1 WHERE id=?").run(ev.id);
  return ev.summary || "last UI change";
}
export function listUiEvents(examId) { ensureEvents(); return db.prepare("SELECT id,summary,undone,created_at FROM ui_events WHERE exam_id=? ORDER BY id DESC LIMIT 30").all(examId); }
// 迁移:把一门考试的 UI 放置表复制到另一门(用户要求"迁移到别的考试")。
export function migrateExamUi(fromExamId, toUserId, toExamId) {
  const pl = getExamPlacement(fromExamId); if (!pl) return false;
  setExamPlacement(toExamId, toUserId, pl, `migrated UI from exam #${fromExamId}`);
  return true;
}

// —— 建考试时【按内容智能删/凸显栏目】——AI 判断哪些【可选】内置栏目跟这门目标相关:
// 无关的(如纯自学理论摆着模拟考/屠杀准备、非表演类摆着表演回放)收进 hidden;相关的保留在可见处。
// 只动这 4 个可选栏目、其余一律默认,失败则什么都不改(不阻塞建考试)。
import { generateJson, langInstruction } from "@/lib/gemini";
import { getDocument } from "@/lib/db";
export async function autoAdjustExamUi(exam, user, dossierText) {
  try {
    const dossier = String(dossierText || getDocument(exam.id, "dossier")?.content_md || "").slice(0, 1500);
    const out = await generateJson(
      `判断这门备考目标该显示哪些【可选栏目】。考试名:「${exam.name}」${exam.exam_type ? "(类型:" + exam.exam_type + ")" : ""}。\n档案摘要:\n${dossier || "(无)"}\n\n对每个栏目给 true/false(true=对这门目标确实有用、该保留;false=无关、该收起):\n- mock:限时全真【模拟考】——只有这门目标真有一场正式考试/测验值得模考才 true;纯自学/纯技能提升/没有考试的目标→false。\n- prep:【屠杀准备】(考务/临场自测:带什么、时间分配、答题策略)——有正式考试才 true;没考试→false。\n- performances:【表演回放】(录像作答+AI点评+重做)——只有艺术/表演/口语/演讲/音乐/舞蹈/技能展示类才 true;其它→false。\n- tasks:【实践任务】(编程/实验动手做+判分)——只有编程/STEM/需要真动手做项目的才 true;其它→false。` + langInstruction(user?.lang),
      { type: "object", properties: { mock: { type: "boolean" }, prep: { type: "boolean" }, performances: { type: "boolean" }, tasks: { type: "boolean" }, reason: { type: "string" } }, required: ["mock", "prep", "performances", "tasks"] });
    let pl = defaultPlacement();
    const conditional = { mock: "morefeatures", prep: "morefeatures", performances: "more", tasks: "morefeatures" };
    for (const [fid, visibleWhere] of Object.entries(conditional)) {
      const keep = out[fid] !== false;   // 只有明确 false 才收起,拿不准就保留(保守)
      for (const bp of ["desktop", "mobile"]) pl = applyMove(pl, bp, fid, keep ? visibleWhere : "hidden");
    }
    setExamPlacement(exam.id, user?.id, pl, "按考试内容自动整理栏目(收起无关、保留相关)");
    return out;
  } catch { return null; }
}
