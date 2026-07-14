// 砖头(类4):让杀手给出「保守/激进」两个计划版本 + 本周vs上周对比。
import { registerBrick } from "@/lib/bricks/registry";
import { compareWeeks, getPlanVariants } from "@/lib/planVersions";

registerBrick({
  name: "plan_compare", category: "planning", title: "计划版本对比(保守/激进 + 本周vs上周)", write: false,
  description: "给出今天计划的【保守版】和【激进版】(两者共用同一个错题本/掌握度),以及【本周 vs 上周】计划快照的变化(薄弱/未学/待复习增减)。用户说「给我一个保守方案和一个激进方案」「这周比上周进步了吗」「计划有什么变化」时用。",
  inputs: [],
  run: async (args, ctx) => {
    let variants = null, weeks = null;
    try { variants = getPlanVariants(ctx.user.id); } catch {}
    try { weeks = compareWeeks(ctx.user.id); } catch {}
    const vsum = variants ? { conservativePoints: variants.conservative.pointsToday, aggressivePoints: variants.aggressive.pointsToday, totalMinutes: variants.totalMinutes, sharedNote: variants.sharedNote } : null;
    const wsum = weeks && weeks.lastWeek ? { lastWeek: weeks.lastWeek.weekKey, weakDelta: weeks.diff.weak, unlearnedDelta: weeks.diff.unlearned, dueDelta: weeks.diff.due } : { note: "还没有上周快照,下周可对比" };
    return { ok: true, variants: vsum, weekCompare: wsum };
  },
});
