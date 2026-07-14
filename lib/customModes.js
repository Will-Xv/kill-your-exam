// C1 + B:自定义互动模式。kind='play'(游戏化学习玩法)或 'exam_form'(自定义考核/考试形式,如苏格拉底答辩、模拟王国)。
// spec 是作者(用户/杀手)用大白话写的"这个玩法/考核怎么进行、怎么算赢",竞技场引擎按它扮演。
import db, { examScope, scopeSql } from "@/lib/db";
import { saveCustomItem, removeCustomItem, registerFeature, retireFeature } from "@/lib/uiRegistry";
import { moveFeature } from "@/lib/uiPlacement";
import { generateJson, langInstruction } from "@/lib/gemini";
import { masteryMatrix } from "@/lib/mastery";

const WHERES = ["nav", "more", "morefeatures", "zone", "hidden"];
export function createMode(user, exam, { kind, name, emoji, spec, meterLabel, winDesc, meterStart, meterDir, format, where }) {
  const k = kind === "exam_form" ? "exam_form" : "play";
  const info = db.prepare(`INSERT INTO custom_modes(exam_id,user_id,kind,name,emoji,spec,meter_label,win_desc,meter_start,meter_dir,scope,format)
    VALUES(?,?,?,?,?,?,?,?,?,?,'exam',?)`).run(
    exam.id, user.id, k, String(name || "自定义模式").slice(0, 40), String(emoji || (k === "exam_form" ? "🎯" : "🎲")).slice(0, 4),
    String(spec || "").slice(0, 4000), String(meterLabel || (k === "exam_form" ? "得分" : "进度")).slice(0, 20),
    String(winDesc || "").slice(0, 200), Number.isFinite(meterStart) ? meterStart : (meterDir === "down" ? 100 : 50), meterDir === "down" ? "down" : "up", format === "video" ? "video" : "interactive");
  const id = info.lastInsertRowid;
  // 考核形式(exam_form)= 一门正经考核 → 给它建一个【独立栏目】,放进这门考试的首页卡片,不塞进竞技场。
  if (k === "exam_form") {
    const fid = "xform" + id;
    const label = String(name || "自定义考核").slice(0, 20);
    const icon = String(emoji || (format === "video" ? "🎬" : "🎯")).slice(0, 4);
    try { saveCustomItem({ id: fid, label, icon, desc: String(winDesc || "自定义考核形式").slice(0, 40), href: "/arena?launch=" + id }); } catch {}
    try { registerFeature({ feature_id: fid, name: label, icon }); } catch {}
    const w = WHERES.includes(where) ? where : "morefeatures";   // AI/用户决定放哪:导航栏/更多/首页卡片/大模块/隐藏
    try { moveFeature(exam.id, user.id, { featureId: fid, where: w }); } catch {}
  }
  return { id, featureId: k === "exam_form" ? "xform" + id : null };
}

export function listModes(exam, kind) {
  const scSql = scopeSql(examScope(exam.id));
  const where = kind ? " AND kind=?" : "";
  const args = kind ? [kind] : [];
  const rows = db.prepare(`SELECT id, kind, name, emoji, meter_label, win_desc, meter_start, meter_dir, spec, format FROM custom_modes WHERE exam_id IN ${scSql}${where} ORDER BY id DESC`).all(...args);
  for (const r of rows) {
    try {
      const last = db.prepare("SELECT score, win FROM custom_mode_results WHERE mode_id=? ORDER BY id DESC LIMIT 1").get(r.id);
      const cnt = db.prepare("SELECT COUNT(*) n, MAX(win) bestWin, MAX(score) best FROM custom_mode_results WHERE mode_id=?").get(r.id);
      r.lastScore = last ? last.score : null; r.lastWin = last ? !!last.win : null; r.attempts = cnt ? cnt.n : 0; r.best = cnt ? cnt.best : null; r.everWon = cnt ? !!cnt.bestWin : false;
    } catch {}
  }
  return rows;
}

export function getMode(id) {
  return db.prepare("SELECT * FROM custom_modes WHERE id=?").get(Number(id)) || null;
}

export function deleteMode(user, id) {
  const m = getMode(id);
  if (!m || m.user_id !== user.id) return false;
  db.prepare("DELETE FROM custom_modes WHERE id=?").run(Number(id));
  if (m.kind === "exam_form") { try { removeCustomItem("xform" + id); } catch {} try { retireFeature("xform" + id); } catch {} }
  return true;
}


export function recordResult(user, mode, { meter, win }) {
  const score = Number.isFinite(meter) ? Math.max(0, Math.min(100, Math.round(meter))) : null;
  db.prepare("INSERT INTO custom_mode_results(mode_id,exam_id,user_id,score,win) VALUES(?,?,?,?,?)").run(mode.id, mode.exam_id, user.id, score, win ? 1 : 0);
  return { ok: true };
}


// AI 创意生成:针对这门考试/学习内容,想出几个【有创意、贴合内容】的考核形式,直接入库。
export async function generateModes(user, exam, { count = 3 } = {}) {
  let topics = "";
  try { topics = masteryMatrix(exam.id).slice(0, 20).map((m) => m.title).join("、"); } catch {}
  const out = await generateJson(
    `为「${exam.name}」这门${exam.exam_type === "study" ? "学习内容" : "考试"}设计 ${count} 个【有创意、真正贴合这门内容】的考核形式。
${topics ? "涉及的知识点(供取材):" + topics : ""}${exam.notes ? "\n补充:" + String(exam.notes).slice(0, 200) : ""}
【不要】普通选择题/简答那种。要像:互动答辩、情境模拟、角色扮演、辩论、案例决策、把理论应用到真实场景的视频作答等——发挥创意,让每个考法都能真正检验"是否学透并会用",而且和这门内容强相关(别套通用模板)。
每个考核给:
- name(考核名)、emoji(一个)
- format:"interactive"(和 AI 多轮互动对话)或 "video"(考生录一段视频、AI 多模态评分)。至少有一个 interactive;若这门内容适合"做出来/演出来/应用出来"就配一个 video。
- spec:大白话写清【这个考核怎么进行、AI 扮演什么、考生要做什么、怎么算赢/满分】,要具体、可执行、扣住这门内容。
- meterLabel:计分条的含义(如 说服力/存活度/应用深度)
- winDesc:达成/满分条件
- meterDir:"up"(越高越好,多数)或 "down"(越低越好,如"把某个错误清零")
要有意思、有区分度、扣题。` + langInstruction(user.lang),
    { type: "object", properties: { modes: { type: "array", items: { type: "object", properties: {
      name: { type: "string" }, emoji: { type: "string" }, format: { type: "string", enum: ["interactive", "video"] },
      spec: { type: "string" }, meterLabel: { type: "string" }, winDesc: { type: "string" }, meterDir: { type: "string", enum: ["up", "down"] },
      placement: { type: "string", enum: ["nav", "more", "morefeatures"], description: "这个考核栏目放哪:nav=导航栏(最显眼,给最核心的1个)/morefeatures=首页卡片(默认)/more=更多菜单(次要的)。按重要度和数量决定,别都堆导航栏。" },
    }, required: ["name", "spec", "format"] } } }, required: ["modes"] }
  );
  const created = [];
  for (const m of (out.modes || []).slice(0, 6)) {
    try { const r = createMode(user, exam, { kind: "exam_form", name: m.name, emoji: m.emoji, spec: m.spec, meterLabel: m.meterLabel, winDesc: m.winDesc, meterDir: m.meterDir, format: m.format, where: m.placement }); created.push({ id: r.id, name: m.name, format: m.format === "video" ? "video" : "interactive", where: m.placement || "morefeatures" }); } catch {}
  }
  return { created };
}