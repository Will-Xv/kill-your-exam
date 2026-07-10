import db, { getDocument, examScope, scopeSql } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";

// 单亲树:顺着 parent_exam_id 往上走到头,返回最顶层(最大的那个)考试。不暴露祖先链列表。
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

// 收集某个根考试下的全部子孙(扁平,带层深),用于首页“子考试栏”
function descendants(rootId) {
  const out = [], seen = new Set([rootId]);
  const walk = (pid, depth) => {
    if (depth > 20) return;
    const kids = db.prepare("SELECT id,name,status FROM exams WHERE parent_exam_id=? AND deleted_at IS NULL ORDER BY id").all(pid);
    for (const k of kids) { if (seen.has(k.id)) continue; seen.add(k.id); out.push({ id: k.id, name: k.name, status: k.status, depth }); walk(k.id, depth + 1); }
  };
  walk(rootId, 0);
  return out;
}

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ exam: null });
  const scope = examScope(exam.id);
  const scSql = scopeSql(scope);
  const aggregating = scope.length > 1;   // 汇总复习已开启且有子考试
  const kpCount = db.prepare(`SELECT COUNT(*) n FROM knowledge_points WHERE exam_id IN ${scSql}`).get().n;
  const matCount = db.prepare(`SELECT COUNT(*) n FROM materials WHERE exam_id IN ${scSql} AND status='ready'`).get().n;
  const attempts = db.prepare(`SELECT COUNT(*) n, SUM(correct) c FROM attempts WHERE exam_id IN ${scSql}`).get();
  const today = db.prepare(`SELECT COUNT(*) n FROM attempts WHERE exam_id IN ${scSql} AND date(created_at)=date('now','localtime')`).get().n;

  const top = topmostExam(exam);            // 最顶层/最大的那个考试(只算,不返回链)
  const subExams = descendants(top.id);     // 顶层考试下的全部子考试(扁平)

  return Response.json({
    exam: { ...exam, self_assessment: safeJson(exam.self_assessment), checklist: safeJson(exam.checklist) },
    topExam: top,
    subExams,
    aggregating,
    aggregateCount: scope.length - 1,
    stats: { kpCount, matCount, attemptCount: attempts.n || 0, correctCount: attempts.c || 0, todayCount: today },
    docs: {
      dossier: getDocument(exam.id, "dossier")?.content_md || "",
      strategy: getDocument(exam.id, "strategy")?.content_md || "",
      progress: getDocument(exam.id, "progress")?.content_md || ""
    }
  });
}
function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }
