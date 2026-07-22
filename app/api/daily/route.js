import db, { rootExamId, familyScope } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { masteryMatrix, dueReviewCount } from "@/lib/mastery";
import { crossExamPlan, currentDailyItems, upcomingCycles } from "@/lib/planner";
import { getBanner } from "@/lib/diagnose";
import { getResolveBanner } from "@/lib/referenceResolve";
import { getPracticalMode, nextIncomplete, maybeAutoAssign, urgentCrossTasks } from "@/lib/practical";
import { getActiveRecipe, currentPhase, methodForKp, methodLink } from "@/lib/recipes";
import { todayStr } from "@/lib/devtime";
// 【H8】今日计数必须用 todayStr()(带日期穿越偏移),不能用 SQLite 的 date('now')——
// 做题写入 attempts 用的是 nowStamp()(已带偏移),读取端若还拿真实今天去比,穿越后计数就不归零(两边对不上)。
import { deliverDue, startReminderLoop } from "@/lib/reminders";
import { startAutoRuleLoop } from "@/lib/autoRules";
import { setReqUser } from "@/lib/reqctx";

export async function GET() {
  const { user, exam } = await requireUser();
    if (user) setReqUser(user.id);
  if (!user) return unauthorized();
  if (!exam) return Response.json({ plan: null });
  try { startReminderLoop(); startAutoRuleLoop(); await deliverDue(user.id); } catch {}  // H3:到期提醒投递(进收件箱+尝试推送)+ 启动后台轮询
  const today = todayStr(); // YYYY-MM-DD 本地
  // 单一数据源:今日任务直接从【跨考试规划器】为当前考试(家族根)实时生成——好逻辑(根因优先 / 含薄弱+未学 / 自由练习封顶 / 按时间分配)在生成时就内建,和「总规划」永远一致。自动计划不落缓存,保证时时同步;只有 killer 自定义的计划(set_daily_plan)才落 daily_plans 并优先。
  const { items } = currentDailyItems(user.id, exam);
  // done 状态由真实数据动态计算,不依赖打卡
  const due = dueReviewCount(exam.id);
  const _famSql = "(" + ((familyScope(exam.id) || []).map(Number).join(",") || "0") + ")"; // 家族范围:母考试的知识点挂在子考试上,只按 exam.id 会漏
  const todayAttempts = db.prepare(`SELECT COUNT(*) n FROM attempts WHERE exam_id IN ${_famSql} AND mode='practice' AND date(created_at,'localtime')=?`).get(todayStr()).n; // 自由练习薄弱点的计数:只算 mode='practice'(不含错题复习 review、也不含新知识那条的 kp)
  const todayNewKp = db.prepare(`SELECT COUNT(*) n FROM attempts WHERE exam_id IN ${_famSql} AND mode='kp' AND date(created_at,'localtime')=?`).get(todayStr()).n; // 学新知识的【今日配额】进度:跨知识点累计(一个知识点学完了,剩下的题接着在下一个上做)
  const enriched = items.map((it) => {
    if (it.type === "review") return { ...it, due, done: due === 0 };
    if (["kp", "practice", "debate", "socratic", "explore"].includes(it.type) && it.kpId) {
      const n = db.prepare(`SELECT COUNT(*) n FROM attempts WHERE kp_id=? AND date(created_at,'localtime')=?`).get(it.kpId, todayStr()).n;
      const ins = db.prepare(`SELECT COUNT(*) n FROM insights WHERE kp_id=? AND date(created_at,'localtime')=?`).get(it.kpId, todayStr()).n;
      // 辩论/苏格拉底/探索是对话式,做过一次就算完成;知识点练习是做题式,要【做够当天目标题数】才算完成(目标默认 3,配方/步骤会覆盖,recipe 段再据 methodCount 重算)
      if (it.type === "debate" || it.type === "socratic" || it.type === "explore") return { ...it, done: (n + ins) > 0 };
      const DEFAULT_KP_TARGET = 6;
      const target = it.n != null ? it.n : DEFAULT_KP_TARGET;
      return { ...it, count: n, insCount: ins, target, done: n >= target };
    }
    if (it.type === "free") return { ...it, count: todayAttempts, done: todayAttempts >= it.target };
    if (it.type === "newkp") {
      // 本周期已经没有新知识 → 今日这条自动算完成(下个周期的只作可选·超前学,不计入完成)
      if (it.cycleDone) return { ...it, count: todayNewKp, done: true };
      return { ...it, count: todayNewKp, target: it.dailyTarget, done: todayNewKp >= it.dailyTarget };
    }
    return it;
  });
  const streak = db.prepare(`SELECT COUNT(DISTINCT date(created_at,'localtime')) n FROM attempts WHERE exam_id=? AND mode!='resolved'`).get(exam.id).n;
  // 跨考试:把规划器对【其他】顶层考试的今日分配也带回首页,让今日任务不再只盯着当前这门。
  let crossExam = null;
  try {
    const cp = crossExamPlan(user.id, {});
    if (cp && cp.examCount > 1) {
      const fam = new Set((familyScope(exam.id) || []).map(Number)); // 当前考试所在的整棵家族树:不当作"别的考试"
      // 所有考试算一个组:其它顶层考试都带回来(顶部切换 chips + “别的考试也别落下”共用这份)
      const others = cp.exams.filter((e) => !fam.has(Number(e.id))).slice(0, 12).map((e) => {
        const top = e.tasks && e.tasks[0] ? e.tasks[0] : null;
        return { examId: e.id, name: e.name, daysLeft: e.daysLeft, allocMinutes: e.allocMinutes, due: e.due,
          top: top ? { type: top.type, title: top.title || null, count: top.count || null, minutes: top.minutes || null, href: top.href || "/practice" } : null };
      });
      if (others.length) crossExam = { totalMinutes: cp.totalMinutes, others };
    }
  } catch {}
  let rootCauseBanner = null; try { rootCauseBanner = getBanner(user.id, exam.id); } catch {}
  let resolveBanner = null; try { resolveBanner = getResolveBanner(user.id, exam.id); } catch {}
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
        if (it.type === "newkp" && it.kpId) { // 学习配方的方法现在作用在【学新知识】这条上(原来单列的薄弱点任务已合并进自由练习)
          const kpObj = mmById[it.kpId] || { id: it.kpId, chapter: it.chapter };
          const m = methodForKp(user.id, exam.id, kpObj);
          if (m) {
            const link = methodLink(m, it.kpId);
            it.method = m.method; it.methodTag = link.tag; it.methodLabel = link.label; it.methodHref = link.href; it.methodCount = link.count;
            if (["socratic", "debate", "explore", "custom_mode"].includes(m.method)) {
              // 非做题方法(对话/对战/探索/自定义考核):做过一次这个活动就算完成,不用题数目标
              it.activity = true; it.target = null; it.done = ((it.count || 0) + (it.insCount || 0)) > 0;
            } else if (link.count != null && (it.type === "newkp" || it.type === "practice")) {
              it.target = link.count; it.done = (it.count || 0) >= it.target; // 练习类:做够目标题数
            }
          }
        }
      }
    }
  } catch {}

  // 复习自动布置实践作业(编程/实践类):开了实践模式就带出下一个未完成里程碑;没有进行中任务时后台自动生成一个。
  let practical = null;
  try {
    const pmode = getPracticalMode(exam.id);
    const gen = pmode ? maybeAutoAssign(user, exam) : false;   // 自动布置只在实践模式下
    const nx = nextIncomplete(exam);                            // 进度显示:只要有未完成的实践作业就带出来(Will:今日任务要显示实践作业进度)
    if (nx) practical = { taskId: nx.taskId, title: nx.title, milestoneTitle: nx.milestoneTitle, idx: nx.idx, done: nx.doneCount, total: nx.total, href: `/tasks?task=${nx.taskId}` };
    else if (pmode && gen) practical = { generating: true, href: "/tasks" };
  } catch {}
  let urgentCross = []; try { urgentCross = urgentCrossTasks(user.id, exam.id, 3); } catch {}
  // 【临近提醒要认"最近的那个考核",不是只认当前这门考试自己的日期】
  // 家族里若有 3 天后的小测,而母考试还很远,以前什么都不会提示。这里给出最近的未过期考核(含名字),前端据此动态显示"距 XX 不到一周"。
  let nearestCycle = null; try { nearestCycle = upcomingCycles(exam, today)[0] || null; } catch {}
  return Response.json({ plan: { date: today, items: enriched }, activeDays: streak, crossExam, urgentCross, rootCauseBanner, resolveBanner, fallback, practical, recipe, nearestCycle });
}
