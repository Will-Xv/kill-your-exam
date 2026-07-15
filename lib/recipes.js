// Workflow Recipe(planner-for-planner)MVP-1:多阶段学习配方——learning_modes 的超集。
// 一个 recipe 把学习拆成若干【阶段(phase)】,每阶段有【选择器(哪些知识点)】+【方法(用什么方式学)】+【出阶段条件】。
// planner/今日任务据"当前阶段"决定每个知识点用什么方法。结构重切/效果自适应留到 MVP-2/3。
import db, { examScope, scopeSql } from "@/lib/db";
import { masteryMatrix } from "@/lib/mastery";

const RANK = { unlearned: 0, weak: 1, ok: 2, mastered: 3 };
export const METHODS = ["practice", "socratic", "debate", "explore", "explain_first", "custom_mode", "ai_choose"];

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
export function recipeVersions(userId, examId) {
  // 当前考试生效配方的版本历史(最近在前)。
  const rec = db.prepare("SELECT * FROM recipes WHERE user_id=? AND active=1 AND (exam_id=? OR exam_id IS NULL) ORDER BY (exam_id IS NOT NULL) DESC, priority DESC, updated_at DESC").get(userId, examId)
    || db.prepare("SELECT * FROM recipes WHERE user_id=? AND (exam_id=? OR exam_id IS NULL) ORDER BY updated_at DESC").get(userId, examId);
  if (!rec) return { recipe: null, versions: [] };
  let vs = [];
  try { vs = db.prepare("SELECT version, spec_json, note, created_at FROM recipe_versions WHERE recipe_id=? ORDER BY version DESC").all(rec.id); } catch {}
  return { recipe: rec, versions: vs };
}

// 纯数字微调:就地改活跃配方里某些阶段的【题数/轮数(method.count)】,零 AI、不重生成整套配方。
// 会作为新版本入栈(可 revert)。changes: [{match, count}] —— match 匹配阶段方法类型(practice/debate/socratic/explain_first)或阶段名关键词。
const _METHOD_ALIAS = { "问答": "practice", "练习": "practice", "做题": "practice", "辩论": "debate", "苏格拉底": "socratic", "讲解": "explain_first" };
export function tweakRecipeCounts(userId, examId, changes) {
  const { recipe: rec } = recipeVersions(userId, examId);
  if (!rec) return { ok: false, reason: "no_recipe" };
  let spec = {}; try { spec = JSON.parse(rec.spec_json || "{}"); } catch {}
  const phases = Array.isArray(spec.phases) ? spec.phases : [];
  if (!phases.length) return { ok: false, reason: "no_phases", name: rec.name };
  const applied = [];
  for (const ch of (Array.isArray(changes) ? changes : [])) {
    if (!ch || ch.count == null) continue;
    const n = Math.max(0, Math.floor(Number(ch.count) || 0));
    const raw = String(ch.match || "").trim();
    const asType = _METHOD_ALIAS[raw] || raw.toLowerCase();
    for (const ph of phases) {
      const mtype = ph.method && ph.method.type;
      const typeMatch = ["practice", "debate", "socratic", "explain_first"].includes(asType) && mtype === asType;
      const nameMatch = raw && ph.name && String(ph.name).toLowerCase().includes(raw.toLowerCase());
      if (typeMatch || nameMatch) { ph.method = { ...(ph.method || {}), count: n }; applied.push(`${ph.name}→${n}`); }
    }
  }
  if (!applied.length) return { ok: false, reason: "no_match", name: rec.name };
  const specStr = JSON.stringify(spec);
  const newVer = (rec.version || 1) + 1;
  db.prepare("UPDATE recipes SET spec_json=?, version=?, updated_at=datetime('now') WHERE id=?").run(specStr, newVer, rec.id);
  try { db.prepare("INSERT INTO recipe_versions(recipe_id,version,spec_json,note) VALUES(?,?,?,?)").run(rec.id, newVer, specStr, "tweak-counts"); } catch {}
  return { ok: true, name: rec.name, applied, newVersion: newVer };
}

// 一键撤回:把当前生效配方回退到【上一个版本】(会作为新版本入栈,可再撤回/前进)。
export function revertRecipe(userId, examId) {
  const { recipe: rec, versions } = recipeVersions(userId, examId);
  if (!rec) return { ok: false, reason: "no_recipe" };
  if (!versions || versions.length < 2) return { ok: false, reason: "no_previous", name: rec.name };
  const prev = versions[1]; // 上一个版本
  const newVer = (rec.version || versions[0].version || 1) + 1;
  db.prepare("UPDATE recipes SET spec_json=?, version=?, updated_at=datetime('now') WHERE id=?").run(prev.spec_json, newVer, rec.id);
  try { db.prepare("INSERT INTO recipe_versions(recipe_id,version,spec_json,note) VALUES(?,?,?,?)").run(rec.id, newVer, prev.spec_json, "revert->v" + prev.version); } catch {}
  return { ok: true, name: rec.name, revertedToVersion: prev.version, newVersion: newVer, scope: rec.exam_id == null ? "global" : "exam" };
}

// 说清"现在到底哪条规则/配方在生效"——把当前考试可见的所有【已激活】配方与学习模式列出,并解释冲突解析。
export function activeRulesSummary(userId, examId) {
  const recipes = db.prepare("SELECT * FROM recipes WHERE user_id=? AND active=1 AND (exam_id=? OR exam_id IS NULL) ORDER BY (exam_id IS NOT NULL) DESC, priority DESC, updated_at DESC").all(userId, examId)
    .map((r) => ({ name: r.name, scope: r.exam_id == null ? "global" : "exam", priority: r.priority, version: r.version }));
  let modes = [];
  try { modes = db.prepare("SELECT name, exam_id, active FROM learning_modes WHERE user_id=? AND active=1 AND (exam_id=? OR exam_id IS NULL) ORDER BY (exam_id IS NOT NULL) DESC").all(userId, examId).map((m) => ({ name: m.name, scope: m.exam_id == null ? "global" : "exam" })); } catch {}
  const governing = recipes[0] || null; // 冲突解析:本考试特异性 > 全局,再 priority,再最近
  return { recipes, modes, governing };
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
const rankOf = (lvl) => RANK[lvl] ?? 0;
function phaseKps(phase, mm) { return mm.filter((k) => selectorMatches(phase.selector, k)); }
function phaseDone(phase, mm) {
  const ex = phase.exit || { type: "mastery_ge", level: "ok" };
  if (ex.type === "manual") return false;
  const kps = phaseKps(phase, mm);
  if (!kps.length) return true;
  if (ex.type === "mastery_ge") { const need = rankOf(ex.level || "ok"); const ok = kps.filter((k) => rankOf(k.level) >= need).length; return ok / kps.length >= 0.8; }
  if (ex.type === "accuracy_ge") { const acc = kps.reduce((a, k) => a + (k.accuracy || 0), 0) / kps.length; return acc >= (ex.pct || 80); }
  return false;
}
function avgRank(kps, snap) { if (!kps.length) return 0; return kps.reduce((a, k) => a + (snap ? (snap[k.id] ?? 0) : rankOf(k.level)), 0) / kps.length; }

// ★ MVP-2 核心:阶段进度 + 效果测量(方法无关的【掌握度增益】)+ ai_choose 自动解析到"表现最好的方法"。
// 有副作用:进入某阶段时快照其知识点掌握度;阶段过后算增益,写 recipe_phase_state。
export function recipeProgress(recipe, examId) {
  const phases = (recipe.spec && recipe.spec.phases) || [];
  if (!phases.length) return { curIndex: 0, phases: [], allDone: true };
  let mm = []; try { mm = masteryMatrix(examId); } catch {}
  // 当前阶段 = 第一个未过
  let curIndex = phases.length - 1, allDone = true;
  for (let i = 0; i < phases.length; i++) { if (!phaseDone(phases[i], mm)) { curIndex = i; allDone = false; break; } }
  const stById = {}; try { for (const r of db.prepare("SELECT * FROM recipe_phase_state WHERE recipe_id=?").all(recipe.id)) stById[r.phase_index] = r; } catch {}
  // 已完成(非 ai_choose)阶段的方法→增益,供 ai_choose 择优
  const methodGain = {}; // method -> [gains]
  const out = [];
  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i]; const kps = phaseKps(ph, mm); const rawMethod = (ph.method && ph.method.type) || "practice";
    let st = stById[i];
    // 进入该阶段(i<=cur)且还没快照 → 记录起点掌握度
    if (i <= curIndex && !st) {
      const snap = {}; for (const k of kps) snap[k.id] = rankOf(k.level);
      try { db.prepare("INSERT OR IGNORE INTO recipe_phase_state(recipe_id,phase_index,method,start_json,start_at,kp_count) VALUES(?,?,?,?,datetime('now'),?)").run(recipe.id, i, rawMethod, JSON.stringify(snap), kps.length); } catch {}
      st = { start_json: JSON.stringify(snap), method: rawMethod, kp_count: kps.length };
    }
    // 已过(i<cur)且还没算增益 → 算掌握度增益
    if (i < curIndex && st && st.done_at == null) {
      let snap = {}; try { snap = JSON.parse(st.start_json || "{}"); } catch {}
      const gain = +(avgRank(kps, null) - avgRank(kps, snap)).toFixed(3); // 现在 rank - 起点 rank
      try { db.prepare("UPDATE recipe_phase_state SET done_at=datetime('now'), gain=? WHERE recipe_id=? AND phase_index=?").run(gain, recipe.id, i); } catch {}
      st = { ...st, done_at: "now", gain };
    }
    const gain = st ? st.gain : null;
    if (i < curIndex && rawMethod !== "ai_choose" && typeof gain === "number") { (methodGain[rawMethod] = methodGain[rawMethod] || []).push(gain); }
    out.push({ index: i, name: ph.name, rawMethod, kpCount: kps.length, status: i < curIndex ? "done" : i === curIndex ? "current" : "future", gain });
  }
  // 解析 ai_choose:选已完成阶段里平均增益最高的方法;无数据→候选首个或 practice
  const bestMethod = (() => {
    const entries = Object.entries(methodGain).map(([m, arr]) => [m, arr.reduce((a, b) => a + b, 0) / arr.length]);
    entries.sort((a, b) => b[1] - a[1]);
    return entries.length ? entries[0][0] : null;
  })();
  for (const p of out) {
    if (p.rawMethod === "ai_choose") {
      const cand = (phases[p.index].method && phases[p.index].method.candidates) || ["practice", "socratic"];
      p.method = bestMethod && cand.includes(bestMethod) ? bestMethod : (bestMethod || cand[0] || "practice");
      p.aiChosen = true;
    } else p.method = p.rawMethod;
  }
  return { curIndex, phases: out, allDone, bestMethod, effectiveness: Object.fromEntries(Object.entries(methodGain).map(([m, a]) => [m, +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2)])) };
}

// 当前处于第几阶段(第一个未过的阶段)。返回 {index, phase, total, allDone, method(已解析)} 或 null。
export function currentPhase(recipe, examId) {
  const prog = recipeProgress(recipe, examId);
  if (!prog.phases.length) return null;
  const phases = recipe.spec.phases;
  const i = prog.curIndex;
  return { index: i, phase: phases[i], total: phases.length, allDone: prog.allDone, method: prog.phases[i] && prog.phases[i].method };
}

// 给定知识点,按当前生效配方返回该用什么方法学(方法已解析 ai_choose)。无配方/未覆盖 → null。
export function methodForKp(userId, examId, kp) {
  const recipe = getActiveRecipe(userId, examId);
  if (!recipe) return null;
  const prog = recipeProgress(recipe, examId);
  const phases = (recipe.spec && recipe.spec.phases) || [];
  let idx = phases.findIndex((p) => selectorMatches(p.selector, kp));
  if (idx < 0) idx = prog.curIndex;
  const pr = prog.phases[idx]; if (!pr) return null;
  return { recipe: recipe.name, phase: phases[idx].name, method: pr.method, methodSpec: phases[idx].method || {}, phaseIndex: prog.curIndex, phaseTotal: phases.length, aiChosen: !!pr.aiChosen };
}

// 方法 → 今日任务的链接与标签。
export function methodLink(m, kpId) {
  const mm = m && m.method;
  const cnt = m && m.methodSpec && m.methodSpec.count != null ? Number(m.methodSpec.count) : null;
  const suf = cnt != null ? ` ×${cnt}` : "";
  if (mm === "socratic") return { href: `/arena?launch=&mode=socratic&kp=${kpId}`, label: "苏格拉底式引导", tag: "🧭", count: cnt };
  if (mm === "debate") return { href: `/arena?mode=debate`, label: "辩论" + suf, tag: "🎤", count: cnt };
  if (mm === "explore") return { href: `/study?kp=${kpId}&mode=explore`, label: "自由探索", tag: "🔍", count: cnt };
  if (mm === "custom_mode") return { href: `/arena?launch=${(m.methodSpec && m.methodSpec.modeId) || ""}`, label: "自定义考核", tag: "🎯", count: cnt };
  if (mm === "explain_first") return { href: `/study?kp=${kpId}`, label: "先看讲解再练", tag: "📖", count: cnt };
  return { href: `/practice?kp=${kpId}${cnt != null ? "&n=" + cnt : ""}`, label: "练习" + suf, tag: "✍️", count: cnt };
}
