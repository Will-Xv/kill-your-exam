import db, { ownScope, scopeSql } from "@/lib/db";
import { estr } from "@/lib/i18nServer";
import { requireUser, unauthorized } from "@/lib/auth";
import { ensureBlueprint, composeFromBlueprint, getBlueprint } from "@/lib/blueprint";

const DEFAULT_MARKS = { single: 2, multi: 3, judge: 1, fill: 3, short: 10, perform: 20 };

export const maxDuration = 300;

// 组一套模拟卷。默认:按「考试蓝图」组卷(覆盖蓝图规划的知识点,题库不够就即时生成)。realOnly:只用历年真题随机组卷。
export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ error: "no exam" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const realOnly = !!body.realOnly;
  const perfExam = exam.exam_type === "performance";
  // 题目总数照蓝图来:前端不再写死 20。真题模式也用蓝图的 totalQuestions 作为目标题数。
  let count = Number(body.count) || 0;
  if (!count) { const _bp = getBlueprint(exam.id); count = (_bp && _bp.totalQuestions) || 20; }

  if (realOnly) {
    const pool = db.prepare(`SELECT * FROM questions WHERE exam_id IN ${scopeSql(ownScope(exam.id))} AND flagged=0 ${perfExam ? "AND qtype='perform'" : ""} AND is_real=1 ORDER BY RANDOM() LIMIT ?`).all(count * 3);
    if (pool.length < 3) return Response.json({ error: estr(user?.lang, "题库里还没有足够的真题。可以让 AI 联网找真题,或先做混合模拟。") }, { status: 400 });
    const byType = {}; for (const q of pool) (byType[q.qtype] ||= []).push(q);
    const picked = []; const types = Object.keys(byType); let i = 0;
    while (picked.length < Math.min(count, pool.length) && types.some((tp) => byType[tp].length)) { const tp = types[i % types.length]; if (byType[tp].length) picked.push(byType[tp].shift()); i++; }
    const marks = {}; picked.forEach((q) => { marks[q.id] = DEFAULT_MARKS[q.qtype] ?? 2; });
    const totalMarks = picked.reduce((s, q) => s + (marks[q.id] || 0), 0);
    const info = db.prepare("INSERT INTO mock_exams(exam_id,config_json) VALUES(?,?)").run(exam.id, JSON.stringify({ questionIds: picked.map((q) => q.id), marks, totalMarks, mode: "real", createdAt: Date.now() }));
    return Response.json({ mockId: info.lastInsertRowid, totalMarks, questions: picked.map((q) => ({ id: q.id, kp_id: q.kp_id, qtype: q.qtype, body: JSON.parse(q.body), marks: marks[q.id] })) });
  }

  // 蓝图模式
  let bp;
  try { bp = await ensureBlueprint(exam, user); } catch (e) { return Response.json({ error: estr(user?.lang, "生成考试蓝图失败,请稍后再试。") }, { status: 500 }); }
  const comp = await composeFromBlueprint(exam, user, bp);
  if (!comp.questionIds.length) {
    let msg;
    if (!comp.kpCount) msg = "这门考试还没有知识点,先去「设置考试」或让杀手建好知识树,才能按蓝图组卷。";
    else if (comp.genError) msg = "题库不足,且即时生成题目失败:" + comp.genError;
    else msg = "题库太少且暂时无法生成,请先在练习页多生成一些题,或让杀手帮忙出题。";
    return Response.json({ error: msg, kpCount: comp.kpCount, bankCount: comp.bankCount }, { status: 400 });
  }
  const info = db.prepare("INSERT INTO mock_exams(exam_id,config_json) VALUES(?,?)").run(exam.id, JSON.stringify({ questionIds: comp.questionIds, marks: comp.marks, totalMarks: comp.totalMarks, durationMin: comp.durationMin, mode: "blueprint", createdAt: Date.now() }));
  return Response.json({ mockId: info.lastInsertRowid, totalMarks: comp.totalMarks, durationMin: comp.durationMin, overview: bp.overview || "", totalQuestions: comp.questionIds.length, plannedQuestions: bp.totalQuestions || null, sourceLevel: bp.sourceLevel || "estimated", sourceNote: bp.sourceNote || "", questions: comp.questions });
}
