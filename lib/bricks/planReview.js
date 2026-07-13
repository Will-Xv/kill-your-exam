// 砖头(类15):让杀手对当前跨考试计划做批判性自我审视。
import { registerBrick } from "@/lib/bricks/registry";
import { reviewPlan } from "@/lib/planReview";

registerBrick({
  name: "plan_review", category: "planning", title: "审视当前跨考试计划(自我 meta 分析)", write: false,
  description: "对系统当前生成的跨考试今日计划做【批判性自我审视】:哪些部分真的基于考生数据、哪些只是通用套路、排的时间是否超时/任务过多、该砍掉哪些约30%低收益任务、有哪些风险与假设。用户说「这个计划靠谱吗」「帮我审视/挑刺这个计划」「是不是排太多了」时用。",
  inputs: [{ key: "minutes", type: "number", required: false, desc: "今日可用总分钟(可选)" }],
  run: async (args, ctx) => {
    const r = await reviewPlan(ctx.user, { totalMinutes: args.minutes });
    if (!r.review) return { ok: false, reason: r.reason || "no_plan" };
    const v = r.review;
    return { ok: true, summary: v.summary, overScheduled: v.overScheduled,
      plannedMinutes: r.plannedMinutes, availableMinutes: r.availableMinutes,
      dataBased: v.dataBased, generic: v.generic, trim: (v.trim || []).map((t) => t.task), risks: v.risks };
  },
});
