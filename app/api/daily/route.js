import db, { rootExamId, familyScope } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { masteryMatrix, dueReviewCount } from "@/lib/mastery";
import { crossExamPlan } from "@/lib/planner";
import { getBanner } from "@/lib/diagnose";
import { getResolveBanner } from "@/lib/referenceResolve";
import { getPracticalMode, nextIncomplete, maybeAutoAssign } from "@/lib/practical";
import { getActiveRecipe, currentPhase, methodForKp, methodLink } from "@/lib/recipes";

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ plan: null });
  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD 本地
  // 单一数据源:今日任务直接从【跨考试规划器】为当前考试(家族根)实时生成——好逻辑(根因优先 / 含薄弱+未学 / 自由练习封顶 / 按时间分配)在生成时就内建,和「总规划」永远一致。自动计划不落缓存,保证时时同步;只有 killer 自定义的计划(set_daily_plan)才落 daily_plans 并优先。
  const custom = db.prepare("SELECT * FROM daily_plans WHERE exam_id=? AND date=?").get(exam.id, today);
  let items;
  if (custom) {
    items = JSON.parse(custom.items_json);
  } else {
    let it = [];
    try {
      const cp = crossExamPlan(user.id, {});
      const rootId = rootExamId(exam.id);
      const e = (cp.exams || []).find((x) => Number(x.id) === Number(rootId)) || (cp.exams || []).find((x) => Number(x.id) === Number(exam.id));
      it = (e && e.tasks ? e.tasks : []).map((tk) => tk.type === "review" ? { type: "review" } : tk.type === "kp" ? { type: "kp", kpId: tk.kpId, title: tk.title } : { type: "free", target: 10 });
    } catch {}
    if (!it.some((x) => x.type === "review")) it.unshift({ type: "review" });
    if (!it.length) it = [{ type: "review" }, { type: "free", target: 10 }];
    items = it;
  }
  // done 状态由真实数据动态计算,不依赖打卡
  const due = dueReviewCount(exam.id);
  const todayAttempts = db.prepare(`SELECT COUNT(*) n FROM attempts WHERE exam_id=? AND mode!='resolved' AND date(created_at,'localtime')=date('now','localtime')`).get(exam.id).n;
  const enriched = items.map((it) => {
    if (it.type === "review") return { ...it, due, done: due === 0 };
    if (it.type === "kp") {
      const n = db.prepare(`SELECT COUNT(*) n FROM attempts WHERE kp_id=? AND date(created_at,'localtime')=date('now','localtime')`).get(it.kpId).n;
      return { ...it, done: n > 0 };
    }
    if (it.type === "free") return { ...it, count: todayAttempts, done: todayAttempts >= it.target };
    return it;
  });
  const streak = db.prepare(`SELECT COUNT(DISTINCT date(created_at,'localtime')) n FROM attempts WHERE exam_id=? AND mode!='resolved'`).get(exam.id).n;
  // 跨考试:把规划器对【其他】顶层考试的今日分配也带回首页,让今日任务不再只盯着当前这门。
  let crossExam = null;
  try {
    const cp = crossExamPlan(user.id, {});
    if (cp && cp.examCount > 1) {
      const fam = new Set((familyScope(exam.id) || []).map(Number)); // 当前考试所在的整棵家族树:不当作"别的考试"
      const others = cp.exams
        .filter((e) => !fam.has(Number(e.id)))
        .slice(0, 4)
        .map((e) => {
          const top = e.tasks && e.tasks[0] ? e.tasks[0] : null;
          return { examId: e.id, name: e.name, daysLeft: e.daysLeft, allocMinutes: e.allocMinutes, due: e.due,
            top: top ? { type: top.type, title: top.title || null, count: top.count || null, minutes: top.minutes || null, href: top.href || "/practice" } : null };
        });
      if (others.length) crossExam = { totalMinutes: cp.totalMinutes, others };
    }
  } catch {}
  let rootCauseBanner = null; try { rootCauseBanner = getBanner(user.id); } catch {}
  let resolveBanner = null; try { resolveBanner = getResolveBanner(user.id); } catch {}
  // 失败预案(类15):今天真没时间也别断——从未完成项里挑最要紧的一件作为「保底」,其余顺延到明天。
  let fallback = null;
  const undone = enriched.filter((it) => !it.done);
  if (undone.length) {
    const pick = undone.find((it) => it.type === "review" && it.due > 0) || undone.find((it) => it.type === "kp") || undone[0];
    fallback = { item: pick, remaining: undone.length, done: enriched.length - undone.length, total: enriched.length };
  }
  // Workflow Recipe(MVP-1):有激活的学习配方时,按【当前阶段】给今日的知识点任务标注该用什么方法学。
  let recipe = null;
  try {
    const rc = getActiveRecipe(user.id, exam.id);
    if (rc) {
      const cur = currentPhase(rc, exam.id);
      recipe = { name: rc.name, phase: cur ? cur.phase.name : null, phaseIndex: cur ? cur.index : 0, phaseTotal: cur ? cur.total : 0, method: cur && cur.phase.method ? cur.phase.method.type : null, allDone: cur ? !!cur.allDone : false };
      let mmById = {}; try { const { masteryMatrix } = await import("@/lib/mastery"); for (const m of masteryMatrix(exam.id)) mmById[m.id] = m; } catch {}
      for (const it of enriched) {
        if (it.type === "kp" && it.kpId) {
          const kpObj = mmById[it.kpId] || { id: it.kpId, chapter: it.chapter };
          const m = methodForKp(user.id, exam.id, kpObj);
          if (m) { const link = methodLink(m, it.kpId); it.method = m.method; it.methodTag = link.tag; it.methodLabel = link.label; it.methodHref = link.href; }
        }
      }
    }
  } catch {}

  // 复习自动布置实践任务(编程/实践类):开了实践模式就带出下一个未完成里程碑;没有进行中任务时后台自动生成一个。
  let practical = null;
  try {
    if (getPracticalMode(exam.id)) {
      const gen = maybeAutoAssign(user, exam);
      const nx = nextIncomplete(exam);
      practical = nx ? { taskId: nx.taskId, title: nx.title, milestoneTitle: nx.milestoneTitle, idx: nx.idx, done: nx.doneCount, total: nx.total, href: "/tasks" } : (gen ? { generating: true, href: "/tasks" } : null);
    }
  } catch {}
  return Response.json({ plan: { date: today, items: enriched }, activeDays: streak, crossExam, rootCauseBanner, resolveBanner, fallback, practical, recipe });
}
