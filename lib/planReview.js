// 类15:让规划器【自我 meta 分析】当前跨考试计划——
// 指出哪些基于真实数据/哪些只是通用建议、执行成本是否超时、砍掉约30%低收益任务、点出风险。
import { generateJson, langInstruction } from "@/lib/gemini";
import { crossExamPlan } from "@/lib/planner";

export async function reviewPlan(user, { totalMinutes, mode } = {}) {
  const cp = crossExamPlan(user.id, { totalMinutes, mode });
  if (!cp.exams || !cp.exams.length) return { review: null, reason: "no_plan" };

  const plannedTotal = cp.exams.reduce((a, e) => a + (e.allocMinutes || 0), 0);
  const lines = cp.exams.map((e) => {
    const tks = (e.tasks || []).map((t) => `${t.type}:${(t.title || t.label || "").slice(0, 40)}(${t.minutes}分)`).join("; ");
    const fz = e.feasibility && e.feasibility.feasible === false ? ` · ⚠️时间不够(需≈${(e.feasibility.needMin/60).toFixed(1)}h/仅≈${(e.feasibility.availMin/60).toFixed(1)}h)` : "";
    return `「${e.name}」剩${e.daysLeft == null ? "?" : e.daysLeft}天 · 分配${e.allocMinutes}分 · 薄弱${e.weak}/未学${e.unlearned}/已掌握${e.mastered}(共${e.kpTotal}) · 到期复习${e.due} · 正确率${e.accuracy}%${fz} · 任务[${tks}]`;
  }).join("\n");

  const out = await generateJson(
    `你是一个【会批判自己的】备考规划审查员。下面是系统给这位考生当前生成的跨考试今日计划。请【挑剔地】审视它,别只夸:
【计划(每门:剩余天数/分配分钟/掌握度分布/到期复习/正确率/具体任务)】
${lines}
【今日可用总时长(系统假设)】${cp.totalMinutes} 分钟;【计划实际排了】${plannedTotal} 分钟。

请输出:
1) dataBased:计划里【确实基于这位考生真实数据】(掌握度、错题、考试日期、到期复习)的部分,逐条列。
2) generic:计划里其实只是【通用套路建议、并非来自他的数据】的部分,诚实列出(没有就空数组)。
3) overScheduled:{over:布尔, detail:一句话} —— 排的时间是否超过可用时长/是否任务过多不现实。
4) trim:该砍掉的【约30%最低收益】任务,每条 {task, why}(为什么低收益)。
5) risks:这个计划【可能错在哪/依赖了什么假设】,逐条。
6) summary:一句话总评。
务实、具体、对事不对人。` + langInstruction(user.lang),
    { type: "object", properties: {
      dataBased: { type: "array", items: { type: "string" } },
      generic: { type: "array", items: { type: "string" } },
      overScheduled: { type: "object", properties: { over: { type: "boolean" }, detail: { type: "string" } }, required: ["over"] },
      trim: { type: "array", items: { type: "object", properties: { task: { type: "string" }, why: { type: "string" } }, required: ["task"] } },
      risks: { type: "array", items: { type: "string" } },
      summary: { type: "string" },
    }, required: ["dataBased", "generic", "overScheduled", "trim", "risks", "summary"] }
  );
  return { review: out, plannedMinutes: plannedTotal, availableMinutes: cp.totalMinutes };
}
