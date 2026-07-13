// 服务端:按考试(per-exam)的功能放置表 + 改动历史(可撤销/可迁移)。杀手的 UI 写砖头用它。
// 仅开发者账号会写(灰度);普通用户没有 per-exam 覆盖,渲染回退到全局默认,行为不变。
import db, { getSetting, setSetting } from "@/lib/db";
import { defaultPlacement, applyMove } from "@/lib/uilab/placementCore";

const key = (examId) => "ui_placement:" + examId;
function ensureEvents() { try { db.exec(`CREATE TABLE IF NOT EXISTS ui_events (id INTEGER PRIMARY KEY, exam_id INTEGER, user_id INTEGER, summary TEXT, before_json TEXT, after_json TEXT, undone INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`); } catch {} }

export function getExamPlacement(examId) { try { const v = getSetting(key(examId), ""); return v ? JSON.parse(v) : null; } catch { return null; } }
// 基准放置表:本考试覆盖 > 全局已发布 > 内置默认。杀手改 UI 从这个基准出发。
export function basePlacement(examId) {
  const ex = getExamPlacement(examId); if (ex) return ex;
  try { const g = getSetting("ui_item_placement", ""); if (g) return JSON.parse(g); } catch {}
  return defaultPlacement();
}
export function setExamPlacement(examId, userId, placement, summary) {
  ensureEvents();
  const before = getSetting(key(examId), "") || "";
  setSetting(key(examId), JSON.stringify(placement));
  try { db.prepare("INSERT INTO ui_events(exam_id,user_id,summary,before_json,after_json) VALUES(?,?,?,?,?)").run(examId, userId, summary || "", before, JSON.stringify(placement)); } catch {}
}
// 杀手移动一个功能(默认电脑+手机一致;传 breakpoint 则只改该端)。记历史、可撤销。
// 杀手/编辑器改导航栏停靠边(top/bottom),默认电脑+手机一致;传 breakpoint 则只改该端。记历史、可撤销。
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
  if (ev.before_json) setSetting(key(examId), ev.before_json); else { try { db.prepare("DELETE FROM settings WHERE key=?").run(key(examId)); } catch {} }
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
