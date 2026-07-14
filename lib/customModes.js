// C1 + B:自定义互动模式。kind='play'(游戏化学习玩法)或 'exam_form'(自定义考核/考试形式,如苏格拉底答辩、模拟王国)。
// spec 是作者(用户/杀手)用大白话写的"这个玩法/考核怎么进行、怎么算赢",竞技场引擎按它扮演。
import db, { examScope, scopeSql } from "@/lib/db";

export function createMode(user, exam, { kind, name, emoji, spec, meterLabel, winDesc, meterStart, meterDir, format }) {
  const k = kind === "exam_form" ? "exam_form" : "play";
  const info = db.prepare(`INSERT INTO custom_modes(exam_id,user_id,kind,name,emoji,spec,meter_label,win_desc,meter_start,meter_dir,scope,format)
    VALUES(?,?,?,?,?,?,?,?,?,?,'exam',?)`).run(
    exam.id, user.id, k, String(name || "自定义模式").slice(0, 40), String(emoji || (k === "exam_form" ? "🎯" : "🎲")).slice(0, 4),
    String(spec || "").slice(0, 4000), String(meterLabel || (k === "exam_form" ? "得分" : "进度")).slice(0, 20),
    String(winDesc || "").slice(0, 200), Number.isFinite(meterStart) ? meterStart : (meterDir === "down" ? 100 : 50), meterDir === "down" ? "down" : "up", format === "video" ? "video" : "interactive");
  return { id: info.lastInsertRowid };
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
  return true;
}


export function recordResult(user, mode, { meter, win }) {
  const score = Number.isFinite(meter) ? Math.max(0, Math.min(100, Math.round(meter))) : null;
  db.prepare("INSERT INTO custom_mode_results(mode_id,exam_id,user_id,score,win) VALUES(?,?,?,?,?)").run(mode.id, mode.exam_id, user.id, score, win ? 1 : 0);
  return { ok: true };
}