// 回档:结构性/破坏性操作前快照受影响考试的状态,可逐级还原;还原后可让 AI 吸取教训。
import db from "@/lib/db";

// 会被快照/还原的、按 exam_id 归属的表
// 【daily_plans 必须在内】否则"撤销刚才那次今日任务改动"无处可撤:
// tweak/reorder/adjust 都是写 daily_plans,而杀手手里的撤销类砖头(ui_undo/rollback/recipe_revert)原本没有一个碰这张表,
// 于是它抓一个最像的、那个在自己范围内确实成功了 → 工具报成功 → 杀手如实转述"已撤销",主人却看到数值原封不动(v12 P5-10)。
// 【practical_tasks 必须在内】v12 P5-9:结构重切 apply 之后新建的实践作业(首页那两张 🛠 Assignment 卡片)
// 在回滚时【没有被清掉】,于是杀手说"已完全恢复原状"、主人却在首页看到明显属于新结构的残留物,"回滚"名不副实。
// 根因就是它不在快照表里:回档只还原了知识点/题/作答/文档,没管这次改动期间新建的旁支任务对象。
const EXAM_TABLES = ["knowledge_points", "questions", "attempts", "insights", "documents", "daily_plans", "practical_tasks"];
const EXAM_FIELDS = ["parent_exam_id", "aggregate_children", "closed_bank"]; // 仅结构字段

function uniq(a) { return [...new Set(a.map(Number).filter(Boolean))]; }

// 快照一组考试的当前状态,返回 checkpointId。label 给人看,op 给机器认。
// 构建一组考试当前状态的快照对象(不落库)。
function buildSnapshot(ids) {
  const inSql = "(" + ids.map(Number).join(",") + ")";
  const data = { exams: {}, tables: {}, reviewQueue: [] };
  for (const eid of ids) {
    const ex = db.prepare("SELECT * FROM exams WHERE id=?").get(eid);
    if (ex) { data.exams[eid] = {}; for (const f of EXAM_FIELDS) data.exams[eid][f] = ex[f]; }
  }
  for (const t of EXAM_TABLES) {
    try { data.tables[t] = db.prepare(`SELECT * FROM ${t} WHERE exam_id IN ${inSql}`).all(); } catch { data.tables[t] = []; }
  }
  try { data.reviewQueue = db.prepare(`SELECT rq.* FROM review_queue rq JOIN questions q ON q.id=rq.question_id WHERE q.exam_id IN ${inSql}`).all(); } catch {}
  return data;
}

// 把一组考试的相关表清掉、按给定快照重建(undo/redo 共用)。
function applySnapshot(ids, data) {
  const inSql = "(" + ids.map(Number).join(",") + ")";
  const tx = db.transaction(() => {
    try { db.prepare(`DELETE FROM review_queue WHERE question_id IN (SELECT id FROM questions WHERE exam_id IN ${inSql})`).run(); } catch {}
    for (const t of EXAM_TABLES) { try { db.prepare(`DELETE FROM ${t} WHERE exam_id IN ${inSql}`).run(); } catch {} }
    for (const t of EXAM_TABLES) reinsert(t, data.tables[t]);
    reinsert("review_queue", data.reviewQueue);
    // 回滚会删掉"检查点之后新建"的实践作业,它们的子表(按 task_id 关联、没有 exam_id 所以进不了快照)会变成孤儿,这里一并清掉
    for (const t of ["task_progress", "task_chat", "task_test_appeals"]) {
      try { db.prepare(`DELETE FROM ${t} WHERE task_id NOT IN (SELECT id FROM practical_tasks)`).run(); } catch {}
    }
    for (const [eid, fields] of Object.entries(data.exams || {})) {
      for (const [f, v] of Object.entries(fields)) { try { db.prepare(`UPDATE exams SET ${f}=? WHERE id=?`).run(v, Number(eid)); } catch {} }
    }
  });
  tx();
}

// 快照一组考试的当前状态,返回 checkpointId。label 给人看,op 给机器认。
export function snapshot(userId, examIds, { op = "op", label = "", runId = null } = {}) {
  const ids = uniq(examIds);
  if (!ids.length) return null;
  const data = buildSnapshot(ids);
  const info = db.prepare("INSERT INTO checkpoints(user_id,run_id,exam_ids,op,label,snapshot_json) VALUES(?,?,?,?,?,?)")
    .run(userId, runId, JSON.stringify(ids), op, label || op, JSON.stringify(data));
  pruneCheckpoints(userId);
  return info.lastInsertRowid;
}

function reinsert(table, rows) {
  if (!rows || !rows.length) return;
  const cols = Object.keys(rows[0]);
  const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`);
  for (const r of rows) stmt.run(...cols.map((c) => r[c]));
}

// 还原到某个检查点:把这些考试的相关表清掉、按快照重建。返回受影响考试。
// 还原到某个检查点(undo):先把【撤销前的当前状态】存进 redo_json 供重做,再按快照重建。
export function restore(checkpointId, userId) {
  const cp = db.prepare("SELECT * FROM checkpoints WHERE id=? AND user_id=?").get(Number(checkpointId), userId);
  if (!cp) throw new Error("checkpoint not found");
  const data = JSON.parse(cp.snapshot_json);
  const ids = JSON.parse(cp.exam_ids).map(Number);
  const after = buildSnapshot(ids);         // 撤销前的当前状态 → 存起来供 redo
  applySnapshot(ids, data);
  db.prepare("UPDATE checkpoints SET undone=1, redo_json=? WHERE id=?").run(JSON.stringify(after), cp.id);
  return { checkpointId: cp.id, examIds: ids, op: cp.op, label: cp.label };
}

// 重做(redo):把 redo_json(撤销前的状态)应用回去。可与 undo 反复来回。
export function redoCheckpoint(checkpointId, userId) {
  const cp = db.prepare("SELECT * FROM checkpoints WHERE id=? AND user_id=?").get(Number(checkpointId), userId);
  if (!cp) throw new Error("checkpoint not found");
  if (!cp.undone || !cp.redo_json) throw new Error("nothing to redo");
  const ids = JSON.parse(cp.exam_ids).map(Number);
  applySnapshot(ids, JSON.parse(cp.redo_json));
  db.prepare("UPDATE checkpoints SET undone=0 WHERE id=?").run(cp.id);
  return { checkpointId: cp.id, examIds: ids, op: cp.op, label: cp.label };
}

// 最近一个【已撤销且可重做】的检查点("重做刚才那次撤销")
export function lastRedoable(userId) {
  const c = db.prepare("SELECT * FROM checkpoints WHERE user_id=? AND undone=1 AND redo_json IS NOT NULL ORDER BY id DESC LIMIT 1").get(userId);
  return c ? { ...c, examIds: JSON.parse(c.exam_ids || "[]") } : null;
}

// 留存策略:每人保留最近 KEEP 个存档点,且不超过 MAX_AGE_DAYS 天;更早的自动清掉(存档点只是“后悔药”,不需要永久留)。
const KEEP = 40, MAX_AGE_DAYS = 60;
export function pruneCheckpoints(userId) {
  try { db.prepare(`DELETE FROM checkpoints WHERE user_id=? AND id NOT IN (SELECT id FROM checkpoints WHERE user_id=? ORDER BY id DESC LIMIT ${KEEP})`).run(userId, userId); } catch {}
  try { db.prepare(`DELETE FROM checkpoints WHERE user_id=? AND created_at < datetime('now','-${MAX_AGE_DAYS} day')`).run(userId); } catch {}
}
export function clearCheckpoints(userId) { const r = db.prepare("DELETE FROM checkpoints WHERE user_id=?").run(userId); return r.changes; }

export function listCheckpoints(userId, limit = 20) {
  return db.prepare("SELECT id, run_id, exam_ids, op, label, created_at, undone, (redo_json IS NOT NULL) AS has_redo FROM checkpoints WHERE user_id=? ORDER BY id DESC LIMIT ?").all(userId, limit)
    .map((c) => {
      const examIds = JSON.parse(c.exam_ids || "[]");
      const names = examIds.map((id) => db.prepare("SELECT name FROM exams WHERE id=?").get(id)?.name).filter(Boolean);
      return { ...c, examIds, names, redoable: !!(c.undone && c.has_redo) };
    });
}
// 最近一个还没撤销的检查点(“撤销刚才那次”)
export function lastCheckpoint(userId) {
  const c = db.prepare("SELECT * FROM checkpoints WHERE user_id=? AND undone=0 ORDER BY id DESC LIMIT 1").get(userId);
  return c ? { ...c, examIds: JSON.parse(c.exam_ids || "[]") } : null;
}

// 结构操作后的完整性自愈:清理指向已删知识点的题/复习项、修父子成环。
export function integrityFix(examIds) {
  const ids = uniq(examIds); if (!ids.length) return { fixed: [] };
  const inSql = "(" + ids.join(",") + ")";
  const fixed = [];
  try { const r = db.prepare(`UPDATE questions SET kp_id=NULL WHERE exam_id IN ${inSql} AND kp_id IS NOT NULL AND kp_id NOT IN (SELECT id FROM knowledge_points)`).run(); if (r.changes) fixed.push(`解绑 ${r.changes} 道指向已删知识点的题`); } catch {}
  try { const r = db.prepare(`DELETE FROM review_queue WHERE question_id NOT IN (SELECT id FROM questions)`).run(); if (r.changes) fixed.push(`清理 ${r.changes} 条孤儿复习项`); } catch {}
  return { fixed };
}

// 教训:AI/用户因问题撤销后沉淀,注入杀手上下文,避免重犯。
export function addLesson(userId, text) {
  const t = String(text || "").trim().slice(0, 500); if (!t) return;
  db.prepare("INSERT INTO agent_lessons(user_id,text) VALUES(?,?)").run(userId, t);
}
export function getLessons(userId, limit = 8) {
  try { return db.prepare("SELECT text FROM agent_lessons WHERE user_id=? ORDER BY id DESC LIMIT ?").all(userId, limit).map((r) => r.text); } catch { return []; }
}
