// 永久功能注册表:记录曾经存在过的每个功能(名称/图标),连删除的也保留(名称/图标仍被占用),
// 用于杀手新建/改名功能时【查重】——不撞任何现有或曾用功能。用户可"彻底丢弃"一个旧名以释放。
import db, { getSetting, setSetting } from "@/lib/db";
import { FEATURE_ITEMS, NATIVE_ITEMS, RESTRICTED_ITEMS } from "@/lib/uilab/items";

let _seeded = false;
export function ensureSeeded() {
  if (_seeded) return;
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS feature_registry (
      id INTEGER PRIMARY KEY, feature_id TEXT UNIQUE, name TEXT, icon TEXT,
      kind TEXT, active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`);
    const ins = db.prepare("INSERT OR IGNORE INTO feature_registry(feature_id,name,icon,kind,active) VALUES(?,?,?,'builtin',1)");
    for (const it of [...NATIVE_ITEMS, ...FEATURE_ITEMS, ...RESTRICTED_ITEMS]) ins.run(it.id, it.label, it.icon);
  } catch {}
  _seeded = true;
}
export function listFeatures() { ensureSeeded(); return db.prepare("SELECT feature_id,name,icon,kind,active FROM feature_registry ORDER BY active DESC, id").all(); }
// 查重:名称或图标是否被任何(含已退役)功能占用。返回占用者,便于杀手明确告知。
export function nameOrIconTaken(name, icon) {
  ensureSeeded();
  const byName = name ? db.prepare("SELECT feature_id,name,active FROM feature_registry WHERE name=?").get(name) : null;
  const byIcon = icon ? db.prepare("SELECT feature_id,icon,active FROM feature_registry WHERE icon=?").get(icon) : null;
  return { nameTaken: byName || null, iconTaken: byIcon || null };
}
export function registerFeature({ feature_id, name, icon }) {
  ensureSeeded();
  db.prepare("INSERT INTO feature_registry(feature_id,name,icon,kind,active) VALUES(?,?,?,'custom',1) ON CONFLICT(feature_id) DO UPDATE SET name=excluded.name, icon=excluded.icon, active=1").run(feature_id, name, icon);
}
export function retireFeature(feature_id) { ensureSeeded(); return db.prepare("UPDATE feature_registry SET active=0 WHERE feature_id=?").run(feature_id).changes > 0; } // 退役:名称/图标仍占用(可回退)
export function releaseName(feature_id) { ensureSeeded(); return db.prepare("DELETE FROM feature_registry WHERE feature_id=? AND kind='custom'").run(feature_id).changes > 0; } // 彻底丢弃:释放名称/图标

// ——— 杀手新建的自定义功能项(存 settings,客户端会取来 setCustomItems 后就能渲染)———
export function getCustomItems() { try { const v = getSetting("ui_custom_items", ""); return v ? JSON.parse(v) : []; } catch { return []; } }
export function saveCustomItem(item) { const arr = getCustomItems().filter((x) => x.id !== item.id); arr.push(item); setSetting("ui_custom_items", JSON.stringify(arr)); }
export function removeCustomItem(id) { setSetting("ui_custom_items", JSON.stringify(getCustomItems().filter((x) => x.id !== id))); }
export function renameCustomItem(id, name, icon) { setSetting("ui_custom_items", JSON.stringify(getCustomItems().map((x) => x.id === id ? { ...x, label: name || x.label, icon: icon || x.icon } : x))); }
export function getFeature(id) { ensureSeeded(); return db.prepare("SELECT feature_id,name,icon,kind,active FROM feature_registry WHERE feature_id=?").get(id) || null; }
