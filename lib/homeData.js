import db, { getDocument, examScope, scopeSql } from "@/lib/db";
import { todayStr } from "@/lib/devtime";
import { listTaskSubs } from "@/lib/practical";

// 单亲树:顺着 parent_exam_id 往上走到头,返回最顶层(最大的那个)考试。
function topmostExam(exam) {
  const seen = new Set([exam.id]);
  let cur = exam, guard = 0;
  while (cur && cur.parent_exam_id && guard++ < 50) {
    const p = db.prepare("SELECT id,name,parent_exam_id,exam_date,status FROM exams WHERE id=? AND deleted_at IS NULL").get(cur.parent_exam_id);
    if (!p || seen.has(p.id)) break;
    seen.add(p.id);
    cur = p;
  }
  return { id: cur.id, name: cur.name, exam_date: cur.exam_date, status: cur.status };
}
function descendants(rootId) {
  const out = [], seen = new Set([rootId]);
  const walk = (pid, depth) => {
    if (depth > 20) return;
    const kids = db.prepare("SELECT id,name,status,exam_date,setup_state FROM exams WHERE parent_exam_id=? AND deleted_at IS NULL ORDER BY id").all(pid);
    for (const k of kids) { if (seen.has(k.id)) continue; seen.add(k.id); out.push({ id: k.id, name: k.name, status: k.status, exam_date: k.exam_date || null, setup_state: k.setup_state || null, depth }); walk(k.id, depth + 1); }
  };
  walk(rootId, 0);
  return out;
}
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

// 首页考试面板的完整数据(GET /api/exam 与首页 SSR 共用,保证首帧就有内容、刷新不闪)。
export function examHomePayload(exam) {
  if (!exam) return { exam: null };
  const scope = examScope(exam.id);
  const scSql = scopeSql(scope);
  const aggregating = scope.length > 1;
  const kpCount = db.prepare(`SELECT COUNT(*) n FROM knowledge_points WHERE exam_id IN ${scSql}`).get().n;
  const matCount = db.prepare(`SELECT COUNT(*) n FROM materials WHERE exam_id IN ${scSql} AND status='ready'`).get().n;
  const attempts = db.prepare(`SELECT COUNT(*) n, SUM(correct) c FROM attempts WHERE exam_id IN ${scSql}`).get();
  // 【H8·首页那个"今日做题"】必须用 todayStr()(带日期穿越偏移),不能用 SQLite 的 date('now')。
  // v12 我只修了 /api/daily 里的四处计数(那是驱动今日任务进度的),而首页统计块走的是这条完全不同的路径,
  // 于是 v13 复测依然不归零 —— 正是"修一个点不等于同类的点都好了"的现成教训。
  const today = db.prepare(`SELECT COUNT(*) n FROM attempts WHERE exam_id IN ${scSql} AND date(created_at)=?`).get(todayStr()).n;
  const top = topmostExam(exam);
  const subExams = descendants(top.id);
  return {
    exam: { ...exam, self_assessment: safeJson(exam.self_assessment), checklist: safeJson(exam.checklist) },
    topExam: top,
    subExams,
    taskSubs: (() => { try { return listTaskSubs(exam.id); } catch { return []; } })(),
    aggregating,
    aggregateCount: scope.length - 1,
    stats: { kpCount, matCount, attemptCount: attempts.n || 0, correctCount: attempts.c || 0, todayCount: today },
    docs: {
      dossier: getDocument(exam.id, "dossier")?.content_md || "",
      strategy: getDocument(exam.id, "strategy")?.content_md || "",
      progress: getDocument(exam.id, "progress")?.content_md || ""
    }
  };
}
