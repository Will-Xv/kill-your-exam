// 表演/口语类:聚合最近若干次录制的【每维度评分】,找出偏弱维度,用来驱动下一次任务/命题。
import db, { examScope, scopeSql } from "@/lib/db";

// 读最近 N 次(该考试家族、优先某 kp)带 dims_json 的表演 attempt,按维度名求平均分。
export function weakestPerformDims(examId, { kpId = null, limit = 8, recent = 20 } = {}) {
  if (!examId) return [];
  let rows = [];
  try {
    const scope = scopeSql(examScope(examId));
    if (kpId) {
      rows = db.prepare(`SELECT dims_json FROM attempts WHERE kp_id=? AND dims_json IS NOT NULL ORDER BY id DESC LIMIT ?`).all(kpId, recent);
    }
    if (rows.length < 3) {
      rows = db.prepare(`SELECT dims_json FROM attempts WHERE exam_id IN ${scope} AND dims_json IS NOT NULL ORDER BY id DESC LIMIT ?`).all(recent);
    }
  } catch { return []; }
  const agg = new Map(); // name -> {sum, n}
  for (const r of rows) {
    let arr = []; try { arr = JSON.parse(r.dims_json || "[]"); } catch {}
    for (const d of arr) {
      if (!d || !d.name) continue;
      const key = String(d.name).trim();
      const cur = agg.get(key) || { sum: 0, n: 0 };
      cur.sum += Number(d.score) || 0; cur.n += 1; agg.set(key, cur);
    }
  }
  const out = [...agg.entries()].map(([name, v]) => ({ name, avg: Math.round(v.sum / v.n), count: v.n }));
  out.sort((a, b) => a.avg - b.avg);
  return out.slice(0, limit);
}

// 供命题/计划用的一句话:哪些维度偏弱(<70 视为弱)。无数据返回空串。
export function weakDimHint(examId, { kpId = null } = {}) {
  const all = weakestPerformDims(examId, { kpId });
  const weak = all.filter((d) => d.avg < 70);
  if (!weak.length) return "";
  return weak.slice(0, 3).map((d) => `${d.name}(平均${d.avg})`).join("、");
}
