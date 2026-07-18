// 砖头:跨考试【按天排期】——把所有考试当一个组,给出有序的多天学习排期;未完成自动顺延(不打乱后续顺序)。
import { registerBrick } from "@/lib/bricks/registry";
import { planDays, dayPlanView, clearDayPlan } from "@/lib/dayPlan";

registerBrick({
  name: "plan_by_day", category: "planning", title: "按天排一份跨考试学习排期(可重排)", write: true,
  description: "把主人【所有考试当成一个组】,排出一份【有序的、一天一天的】学习排期,存下来在「跨考试规划」里显示。主人说「帮我把这周/这几天的任务按天排开」「给我做个学习计划表」「重新排一下排期」时用。units=【有序】的单元数组(JSON文本),由先到后、由易到难排;每项可只写标题字符串,或 {title, examId(哪门考试,可选), taskId(关联的实践作业,可选), day(第几天,0=第一天;不填就按 perDay 顺序均摊)}。perDay=每天几项(默认1)。startDate=第一天 YYYY-MM-DD(默认今天,用系统提示里的今天换算)。title=排期名。★这是【整体重排】:每次调用都会用新的 units 覆盖旧排期。★重点:每门考试都别落下、临近考试的靠前、循序渐进;未完成的系统会自动顺延到后面,不用你手动补。",
  inputs: [
    { key: "units", type: "json", required: true, desc: "有序单元数组的JSON文本,如 [\"复习第一单元\",{\"title\":\"手写BPE\",\"taskId\":14},\"MAT235 第2章练习\"]" },
    { key: "title", type: "string", required: false, desc: "排期名,如 本周冲刺" },
    { key: "perDay", type: "number", required: false, desc: "每天几项(默认1)" },
    { key: "startDate", type: "string", required: false, desc: "第一天 YYYY-MM-DD(默认今天)" },
  ],
  run: async (args, ctx) => {
    let units = args && args.units;
    if (typeof units === "string") { try { units = JSON.parse(units); } catch { units = null; } }
    if (!Array.isArray(units) || !units.length) throw new Error("units 需要一个非空的有序数组");
    const plan = planDays(ctx.user.id, { title: args.title, units, perDay: args.perDay, startDate: args.startDate });
    const view = dayPlanView(ctx.user.id);
    return { ok: true, title: plan.title, startDate: plan.startDate, perDay: plan.perDay, count: plan.items.length, dueToday: view ? view.dueNow.length : 0, hint: "排期已存好,主人可到「跨考试规划」查看/编辑;未完成的会自动顺延。" };
  },
});

registerBrick({
  name: "clear_day_plan", category: "planning", title: "清空按天排期", write: true,
  description: "把当前的跨考试按天排期整个清掉。主人说「把排期删了/清空排期表」时用。",
  inputs: [],
  run: async (args, ctx) => { clearDayPlan(ctx.user.id); return { ok: true, note: "排期已清空。" }; },
});
