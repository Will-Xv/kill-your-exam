// 砖头:跨考试【按天排期】——把所有考试当一个组,给出有序的多天学习排期;未完成自动顺延(不打乱后续顺序)。
import { registerBrick } from "@/lib/bricks/registry";
import { planDays, dayPlanView, clearDayPlan, addDayPlanItems } from "@/lib/dayPlan";
import { generateJson } from "@/lib/gemini";
import { todayStr } from "@/lib/devtime";

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


registerBrick({
  name: "plan_from_syllabus", category: "planning", title: "按 syllabus 排一整学期(自动抽取作业/考试日期)", write: true,
  description: "主人【给了一份 syllabus / 教学大纲 / 课程日程】(贴文字或上传文件,里面有各次作业 due、考试日期、每周主题)时用:你把它读出来,【抽取整学期所有有日期的事项】(每次作业+其 due、每场考试+日期、可选每周该读/该做的),我会自动换算成排期、按日期铺满整学期,接进「跨考试规划」的按天排期表(过期的自动顺延)。syllabus=把大纲里和日程/截止/考试有关的内容尽量【原样抄进来】(你能读到上传的文件就照着抄全);examName=这门课名(可选,给每项打标);title=排期名(可选);replace=true 表示【重建】整份排期(默认 false=把这门课的日程【追加】进现有排期,可多门课累加)。★日期要用绝对日期 YYYY-MM-DD;syllabus 里只写「第3周」这种就按开学日期推算成具体日期。",
  inputs: [
    { key: "syllabus", type: "string", required: true, desc: "syllabus 里与日程/作业due/考试有关的内容(尽量抄全)" },
    { key: "examName", type: "string", required: false, desc: "课程名(给每项打标,可选)" },
    { key: "title", type: "string", required: false, desc: "排期名(可选)" },
    { key: "replace", type: "boolean", required: false, desc: "true=重建整份排期;默认 false=追加到现有排期" },
  ],
  run: async (args, ctx) => {
    const syl = String((args && args.syllabus) || "").slice(0, 24000);
    if (!syl.trim()) throw new Error("syllabus 内容为空");
    const tag = args && args.examName ? String(args.examName).slice(0, 40) : "";
    const out = await generateJson(
      `今天是 ${todayStr()}。下面是一份课程 syllabus/日程。请抽取【整学期所有有具体日期的事项】,输出一个【按日期从早到晚排序】的数组 items,每项 {title(简短、含是第几次作业/哪场考试/该做什么), date(该事项发生或截止的绝对日期 YYYY-MM-DD), kind("assignment"作业due / "exam"考试 / "study"该读该学的内容)}。规则:① 日期一律用 YYYY-MM-DD 绝对日期;syllabus 只写"第N周/Week N"就按其中能找到的开学或起始日期推算成具体日期(推算不出就跳过该项)。② 只收真有日期的;没有明确日期的泛泛条目不要。③ 别编造不存在的日期。④ 最多 60 项。

【syllabus】
${syl}`,
      { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { title: { type: "string" }, date: { type: "string" }, kind: { type: "string" } }, required: ["title", "date"] } } }, required: ["items"] }
    );
    let items = (out && Array.isArray(out.items) ? out.items : []).filter((it) => it && it.title && /^\d{4}-\d{2}-\d{2}$/.test(String(it.date || "")));
    items = items.map((it) => ({ title: (tag ? tag + " · " : "") + String(it.title).slice(0, 200), date: it.date })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (!items.length) return { ok: false, note: "没从 syllabus 里抽到任何带明确日期的事项——可能日期是相对周次且没有开学日期,或内容太少。可让主人补一句开学日期再试。" };
    const plan = addDayPlanItems(ctx.user.id, { title: args && args.title, items, replace: !!(args && args.replace) });
    const view = dayPlanView(ctx.user.id);
    return { ok: true, added: items.length, total: plan.items.length, first: items[0].date, last: items[items.length - 1].date, dueNow: view ? view.dueNow.length : 0, hint: `已从 syllabus 排进 ${items.length} 项(${items[0].date} → ${items[items.length - 1].date}),接入「跨考试规划」的按天排期;过期的会自动顺延。` };
  },
});
