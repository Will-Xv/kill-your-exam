import { requireUser, unauthorized } from "@/lib/auth";
import { buildStudyTimetable } from "@/lib/studyPlan";

// 排学习进程时间表:问完全部计划参数后一次性生成,写进按天排期(/plan 里可再改/同意)。
export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ ok: false, note: "no_exam" });
  const b = await req.json().catch(() => ({}));
  const skipDays = b.skipWeekends ? [0, 6] : (Array.isArray(b.skipDays) ? b.skipDays.map(Number) : []);
  const r = buildStudyTimetable(user.id, exam, {
    mode: b.mode || (b.examDate ? "deadline" : "open"),
    examDate: b.examDate || exam.exam_date || null,
    targetDate: b.targetDate || null,
    weeks: b.weeks || null,
    dailyMinutes: b.dailyMinutes || 60,
    skipDays,
    replace: b.replace !== false,
  });
  if (!r.ok) return Response.json({ ok: false, note: r.note === "no_kps" ? "这门考试还没有知识点,先在追杀计划里让它生成知识树。" : "没能生成计划。" });
  return Response.json(r);
}
