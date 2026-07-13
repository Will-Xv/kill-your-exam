// 命名学习模式/配方:把用户用大白话定的规则存成结构化数据(rules 文本),激活后注入杀手系统提示,杀手照着执行。
// 这是"纯行为规则"层(第①步):杀手读规则并遵守。需要"自动触发器"(连错两题自动降难度等)的部分留到第②步在真实代码里埋钩子。
import db from "@/lib/db";

const g = (examId) => (examId == null ? null : examId);

// 存/改一个模式。scope: "exam"(本考试) | "global"(全局·你的全部杀技)。activate: 存完是否立即激活。
export function saveMode(userId, examId, name, rules, { scope = "exam", activate = true } = {}) {
  const eid = scope === "global" ? null : g(examId);
  const nm = String(name || "").trim();
  if (!nm) return null;
  const existing = db.prepare("SELECT id FROM learning_modes WHERE user_id=? AND name=? AND " + (eid == null ? "exam_id IS NULL" : "exam_id=?"))
    .get(...(eid == null ? [userId, nm] : [userId, nm, eid]));
  if (existing) {
    db.prepare("UPDATE learning_modes SET rules=?, active=?, updated_at=datetime('now') WHERE id=?").run(String(rules || ""), activate ? 1 : 0, existing.id);
    return { id: existing.id, name: nm, scope: eid == null ? "global" : "exam", active: !!activate, updated: true };
  }
  const r = db.prepare("INSERT INTO learning_modes(user_id,exam_id,name,rules,active) VALUES(?,?,?,?,?)").run(userId, eid, nm, String(rules || ""), activate ? 1 : 0);
  return { id: r.lastInsertRowid, name: nm, scope: eid == null ? "global" : "exam", active: !!activate, updated: false };
}

// 列出该用户在本考试可见的所有模式(全局 + 本考试)
export function listModes(userId, examId) {
  const eid = g(examId);
  return db.prepare(
    "SELECT id,name,rules,active,exam_id FROM learning_modes WHERE user_id=? AND (exam_id IS NULL" + (eid == null ? "" : " OR exam_id=?") + ") ORDER BY exam_id IS NULL DESC, updated_at DESC"
  ).all(...(eid == null ? [userId] : [userId, eid]))
    .map((m) => ({ id: m.id, name: m.name, rules: m.rules, active: !!m.active, scope: m.exam_id == null ? "global" : "exam" }));
}

// 激活/停用(按名字,本考试或全局都算)
export function setActive(userId, examId, name, active) {
  const eid = g(examId);
  const r = db.prepare(
    "UPDATE learning_modes SET active=?, updated_at=datetime('now') WHERE user_id=? AND name=? AND (exam_id IS NULL" + (eid == null ? "" : " OR exam_id=?") + ")"
  ).run(active ? 1 : 0, ...(eid == null ? [userId, name] : [userId, name, eid]));
  return r.changes > 0;
}

export function deleteMode(userId, examId, name) {
  const eid = g(examId);
  const r = db.prepare(
    "DELETE FROM learning_modes WHERE user_id=? AND name=? AND (exam_id IS NULL" + (eid == null ? "" : " OR exam_id=?") + ")"
  ).run(...(eid == null ? [userId, name] : [userId, name, eid]));
  return r.changes > 0;
}

// 当前【已激活】模式的规则汇总,注入系统提示(杀手照此执行)
export function activeModesDigest(userId, examId) {
  const rows = listModes(userId, examId).filter((m) => m.active && (m.rules || "").trim());
  if (!rows.length) return "";
  return rows.map((m) => `〖${m.name}·${m.scope === "global" ? "全局" : "本考试"}〗\n${m.rules.trim()}`).join("\n\n");
}
