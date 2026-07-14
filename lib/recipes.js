// Workflow Recipe(planner-for-planner)MVP-1:多阶段学习配方——learning_modes 的超集。
// 一个 recipe 把学习拆成若干【阶段(phase)】,每阶段有【选择器(哪些知识点)】+【方法(用什么方式学)】+【出阶段条件】。
// planner/今日任务据"当前阶段"决定每个知识点用什么方法。结构重切/效果自适应留到 MVP-2/3。
import db, { examScope, scopeSql } from "@/lib/db";
import { masteryMatrix } from "@/lib/mastery";

const RANK = { unlearned: 0, weak: 1, ok: 2, mastered: 3 };
export const METHODS = ["practice", "socratic", "debate", "explain_first", "custom_mode", "ai_choose"];

function parseSpec(r) { try { return JSON.parse(r.spec_json) || {}; } catch { return {}; } }

// 存/改一个配方:按(user,exam,name)升级版本 + 存历史。scope: exam(有exam_id)或 global(exam_id NULL)。
export function saveRecipe(userId, examId, { name, description, spec, scope = "exam", priority = 0, activate = true }) {
  const nm = String(name || "").trim(); if (!nm) return null;
  const eid = scope === "global" ? null : examId;
  const specStr = JSON.stringify(spec || {});
  const existing = db.prepare("SELECT * FROM recipes WHERE user_id=? AND name=? AND " + (eid == null ? "exam_id IS NULL" : "exam_id=?")).get(...(eid == null ? [userId, nm] : [userId, nm, eid]));
  if (existing) {
    const ver = (existing.version || 1) + 1;
    db.prepare("UPDATE recipes SET description=?, spec_json=?, priority=?, active=?, version=?, updated_at=datetime('now') WHERE id=?").run(String(description || ""), specStr, priority, activate ? 1 : 0, ver, existing.id);
    try { db.prepare("INSERT INTO recipe_versions(recipe_id,version,spec_json,note) VALUES(?,?,?,?)").run(existing.id, ver, specStr, "update"); } catch {}
    return { id: existing.id, name: nm, version: ver, active: !!activate, scope: eid == null ? "global" : "exam", updated: true };
  }
  const info = db.prepare("INSERT INTO recipes(user_id,exam_id,name,description,spec_json,priority,active,version) VALUES(?,?,?,?,?,?,?,1)").run(userId, eid, nm, String(description || ""), specStr, priority, activate ? 1 : 0);
  try { db.prepare("INSERT INTO recipe_versions(recipe_id,version,spec_json,note) VALUES(?,1,?,?)").run(info.lastInsertRowid, specStr, "create"); } catch {}
  return { id: info.lastInsertRowid, name: nm, version: 1, active: !!activate, scope: eid == null ? "global" : "exam", updated: false };
}

export function listRecipes(userId, examId) {
  const eid = examId || null;
  const rows = db.prepare("SELECT * FROM recipes WHERE user_id=? AND (exam_id IS NULL" + (eid == null ? "" : " OR exam_id=?") + ") ORDER BY exam_id IS NULL ASC, priority DESC, updated_at DESC").all(...(eid == null ? [userId] : [userId, eid]));
  return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, active: !!r.active, scope: r.exam_id == null ? "global" : "exam", version: r.version, priority: r.priority, spec: parseSpec(r) }));
}

// 生效配方:优先本考试作用域、再按 priority、再按最近更新(冲突解析 = scope 特异性 > priority > recency)。
export function getActiveRecipe(userId, examId) {
  const rows = db.prepare("SELECT * FROM recipes WHERE user_id=? AND active=1 AND (exam_id=? OR exam_id IS NULL) ORDER BY (exam_id IS NOT NULL) DESC, priority DESC, updated_at DESC").all(userId, examId);
  if (!rows.length) return null;
  const r = rows[0];
  return { id: r.id, name: r.name, version: r.version, scope: r.exam_id == null ? "global" : "exam", spec: parseSpec(r) };
}

export function activateRecipe(userId, id, active) {
  const r = db.prepare("SELECT id FROM recipes WHERE id=? AND user_id=?").get(id, userId);
  if (!r) return false;
  db.prepare("UPDATE recipes SET active=?, updated_at=datetime('now') WHERE id=?").run(active ? 1 : 0, id);
  return true;
}
export function deleteRecipe(userId, id) {
  const r = db.prepare("SELECT id FROM recipes WHERE id=? AND user_id=?").get(id, userId);
  if (!r) return false;
  db.prepare("DELETE FROM recipes WHERE id=?").run(id);
  try { db.prepare("DELETE FROM recipe_versions WHERE recipe_id=?").run(id); } catch {}
  return true;
}

// 一个选择器是否覆盖某知识点(mm 行:含 title/chapter/level)。
function selectorMatches(sel, kp) {
  if (!sel || sel.type === "all") return true;
  const val = Array.isArray(sel.value) ? sel.value.map((x) => String(x).toLowerCase()) : [];
  if (sel.type === "kp_ids") return (sel.value || []).map(Number).includes(kp.id);
  if (sel.type === "chapters") { const ch = String(kp.chapter || "").toLowerCase(); return val.some((v) => ch.includes(v) || v.includes(ch)); }
  if (sel.type === "weak") return kp.level === "weak" || kp.level === "unlearned";
  return false;
}

// 某阶段是否"已过"(达到出阶段条件)。默认 mastery_ge=ok:该阶段覆盖的知识点大多达到 ok+。
function phaseDone(phase, mm) {
  const ex = phase.exit || { type: "mastery_ge", level: "ok" };
  if (ex.type === "manual") return false;
  const kps = mm.filter((k) => selectorMatches(phase.selector, k));
  if (!kps.length) return true;
  if (ex.type === "mastery_ge") { const need = RANK[ex.level || "ok"] ?? 2; const ok = kps.filter((k) => (RANK[k.level] ?? 0) >= need).length; return ok / kps.length >= 0.8; }
  if (ex.type === "accuracy_ge") { const acc = kps.reduce((a, k) => a + (k.accuracy || 0), 0) / kps.length; return acc >= (ex.pct || 80); }
  return false;
}

// 当前处于第几阶段(第一个未过的阶段)。返回 {index, phase} 或 null。
export function currentPhase(recipe, examId) {
  const phases = (recipe.spec && recipe.spec.phases) || [];
  if (!phases.length) return null;
  let mm = []; try { mm = masteryMatrix(examId); } catch {}
  for (let i = 0; i < phases.length; i++) { if (!phaseDone(phases[i], mm)) return { index: i, phase: phases[i], total: phases.length }; }
  return { index: phases.length - 1, phase: phases[phases.length - 1], total: phases.length, allDone: true };
}

// 给定知识点,按当前生效配方返回该用什么方法学(含链接提示)。无配方/未覆盖 → null。
export function methodForKp(userId, examId, kp) {
  const recipe = getActiveRecipe(userId, examId);
  if (!recipe) return null;
  const cur = currentPhase(recipe, examId);
  const phases = (recipe.spec && recipe.spec.phases) || [];
  // 优先:覆盖此 kp 的、且是"当前或更早未过"阶段的方法;否则用当前阶段方法。
  let phase = phases.find((p) => selectorMatches(p.selector, kp)) || (cur && cur.phase);
  if (!phase) return null;
  const method = (phase.method && phase.method.type) || "practice";
  return { recipe: recipe.name, phase: phase.name, method, methodSpec: phase.method || {}, phaseIndex: cur ? cur.index : 0, phaseTotal: cur ? cur.total : phases.length };
}

// 方法 → 今日任务的链接与标签。
export function methodLink(m, kpId) {
  const mm = m && m.method;
  if (mm === "socratic") return { href: `/arena?launch=&mode=trial&kp=${kpId}`, label: "苏格拉底式受审", tag: "⚖️" };
  if (mm === "debate") return { href: `/arena?mode=debate`, label: "辩论", tag: "🎤" };
  if (mm === "custom_mode") return { href: `/arena?launch=${(m.methodSpec && m.methodSpec.modeId) || ""}`, label: "自定义考核", tag: "🎯" };
  if (mm === "explain_first") return { href: `/study?kp=${kpId}`, label: "先看讲解再练", tag: "📖" };
  return { href: `/practice?kp=${kpId}`, label: "练习", tag: "✍️" };
}
