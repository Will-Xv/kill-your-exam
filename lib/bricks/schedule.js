// 砖头:跨考试【按天排期】——把所有考试当一个组,给出有序的多天学习排期;未完成自动顺延(不打乱后续顺序)。
import { registerBrick } from "@/lib/bricks/registry";
import { planDays, dayPlanView, clearDayPlan, addDayPlanItems } from "@/lib/dayPlan";
import { generateJson } from "@/lib/gemini";
import { todayStr } from "@/lib/devtime";

registerBrick({
  name: "plan_by_day", category: "planning", title: "按天排一份跨考试学习排期(可重排)", write: true,
  description: "把主人【所有考试当成一个组】,排出一份【有序的、一天一天的】学习排期,存下来在「跨考试规划」里显示。主人说「帮我把这周/这几天的任务按天排开」「给我做个学习计划表」「重新排一下排期」时用。units=【有序】的单元数组(JSON文本),由先到后、由易到难排;每项可只写标题字符串,或 {title, examId(可选), taskId(关联作业,可选), href(可选:练习 /practice、趣味挑战 /arena、模拟考 /mock、学习 /study), day(第几天,0=第一天;不填按 perDay 均摊)}。【任何带安排的活动都能排:练习/趣味挑战/复习/作业等】。perDay=每天几项(默认1)。startDate=第一天 YYYY-MM-DD(默认今天,用系统提示里的今天换算)。title=排期名。★这是【整体重排】:每次调用都会用新的 units 覆盖旧排期。★重点:每门考试都别落下、临近考试的靠前、循序渐进;未完成的系统会自动顺延到后面,不用你手动补。",
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

// —— 【循环自动规则】用户不在时也能定期自动跑(定时提醒 / 每周本周计划摘要)——
import { addAutoRule, listAutoRules, deleteAutoRule } from "@/lib/autoRules";
import { getActiveExam as _getExam } from "@/lib/db";

registerBrick({
  name: "set_auto_rule", category: "planning", title: "设一个循环自动规则(定时提醒/每周计划摘要)", write: true,
  description: "给主人设一个【会自动反复执行的定时规则】——服务端到点自动跑,主人不在也会收到(收件箱+推送)。主人说「每周一早上把本周计划发我」「每天晚上8点提醒我做作业」「每周日晚提醒我复盘」时用,你也可以在按 syllabus/排好计划后【主动建议并设一个每周计划摘要】。kind:'plan_digest'=自动汇总【本周计划】发给主人(配合按天排期/ syllabus 用);'reminder'=发一句固定提醒文字(要填 text)。freq:'weekly'(周) 或 'daily'(每天)。weekday:周任务用,0=周日…1=周一…6=周六(默认周一)。time:'HH:MM' 24 小时(默认 09:00)。text:reminder 的提醒内容。",
  inputs: [
    { key: "kind", type: "string", required: false, desc: "'plan_digest'(每周本周计划摘要) 或 'reminder'(固定提醒);默认 plan_digest" },
    { key: "freq", type: "string", required: false, desc: "'weekly' 或 'daily'(默认 weekly)" },
    { key: "weekday", type: "number", required: false, desc: "周任务在星期几:0=周日,1=周一…6=周六(默认1)" },
    { key: "time", type: "string", required: false, desc: "触发时刻 HH:MM(默认 09:00)" },
    { key: "text", type: "string", required: false, desc: "reminder 类型的提醒内容" },
  ],
  run: async (args, ctx) => {
    const exam = ctx.exam || _getExam(ctx.user.id);
    const kind = args && args.kind === "reminder" ? "reminder" : "plan_digest";
    const freq = args && args.freq === "daily" ? "daily" : "weekly";
    let hour = 9, minute = 0;
    if (args && typeof args.time === "string" && /^\d{1,2}:\d{2}$/.test(args.time)) { const [h, m] = args.time.split(":").map(Number); hour = h; minute = m; }
    const r = addAutoRule(ctx.user.id, exam ? exam.id : null, { kind, freq, weekday: args && args.weekday != null ? args.weekday : 1, hour, minute, text: args && args.text });
    return { ok: true, id: r.id, kind, freq, nextRun: r.nextRun, hint: `已设好${freq === "weekly" ? "每周" : "每天"}${kind === "plan_digest" ? "自动发本周计划" : "定时提醒"},下次:${r.nextRun}。用户不在也会自动跑(收件箱+推送)。` };
  },
});

registerBrick({
  name: "list_auto_rules", category: "planning", title: "列出所有循环自动规则", write: false,
  description: "列出主人当前所有会自动反复执行的定时规则(定时提醒/每周计划摘要)及下次触发时间。",
  inputs: [],
  run: async (args, ctx) => ({ ok: true, rules: listAutoRules(ctx.user.id).map((r) => ({ id: r.id, kind: r.kind, freq: r.freq, weekday: r.weekday, time: `${String(r.hour).padStart(2, "0")}:${String(r.minute).padStart(2, "0")}`, text: r.text || null, next: r.next_run })) }),
});

registerBrick({
  name: "delete_auto_rule", category: "planning", title: "删掉一个循环自动规则", write: true,
  description: "删掉一个循环自动规则(先用 list_auto_rules 拿 id)。主人说「别再每周给我发计划了」「取消那个定时提醒」时用。",
  inputs: [{ key: "id", type: "number", required: true, desc: "要删的规则 id" }],
  run: async (args, ctx) => ({ ok: deleteAutoRule(ctx.user.id, args && args.id), note: "已删除该自动规则。" }),
});

registerBrick({
  name: "add_plan_items", category: "planning", title: "把指定日期的事项加进按天排期表", write: true,
  description: "把【一条或多条带具体日期的事项】追加进「跨考试规划」的按天排期表(不覆盖现有排期)。用于主人说「X号做A、Y号做B、Z号做C」这类【多个不同日期各一件事】的场景——你既可以用 set_reminder 给每天排提醒,也【同时】用本工具把它们加进排期表,主人在 /plan 周历里就能一眼看到各自在哪天。items=数组的JSON文本,每项 {title, date('YYYY-MM-DD' 绝对日期), taskId(可选,关联作业→点击去/tasks), href(可选,点击跳去的页面:练习填 /practice、趣味挑战/竞技场填 /arena、模拟考 /mock、复习/学习 /study)}。【凡是带日期的活动都能排:作业、某天做几道练习、哪天玩趣味挑战、复习等】。默认追加;replace=true 则整体重建排期。",
  inputs: [
    { key: "items", type: "json", required: true, desc: "带日期的事项数组JSON,如 [{\"title\":\"做A\",\"date\":\"2026-08-03\"},{\"title\":\"做B\",\"date\":\"2026-08-10\"}]" },
    { key: "replace", type: "boolean", required: false, desc: "true=重建整份排期;默认 false=追加" },
  ],
  run: async (args, ctx) => {
    let items = args && args.items;
    if (typeof items === "string") { try { items = JSON.parse(items); } catch { items = null; } }
    if (!Array.isArray(items) || !items.length) throw new Error("items 需要一个非空数组");
    const clean = items.map((u) => ({ title: String((u && u.title) || "").slice(0, 200), date: String((u && u.date) || ""), taskId: u && u.taskId != null ? u.taskId : null, href: u && u.href ? String(u.href) : null })).filter((u) => u.title && /^\d{4}-\d{2}-\d{2}$/.test(u.date));
    if (!clean.length) throw new Error("每项都要有 title 和 YYYY-MM-DD 的 date");
    const plan = addDayPlanItems(ctx.user.id, { items: clean, replace: !!(args && args.replace) });
    return { ok: true, added: clean.length, total: plan.items.length, hint: `已把 ${clean.length} 项加进按天排期表,主人可在 /plan 周历里查看。` };
  },
});

// —— 【排学习进程时间表】按 考试日期/学到某天/学N周/无期限 把知识点铺进按天排期,估算大概学多久 ——
import { buildStudyTimetable } from "@/lib/studyPlan";

registerBrick({
  name: "build_study_plan", category: "planning", title: "排一份学习进程时间表(按日期/时长/无期限)", write: true,
  description: "把这门考试的知识点【按学习进程铺进按天排期】。★优先让主人用页面上的『排学习计划』弹窗来定这些参数(计划类的问题走弹窗、别在对话里一条条追问);当参数已经明确时才用本工具直接生成。mode:'deadline'(有考试日期,用 examDate)/'until'(学到某天,用 targetDate)/'weeks'(用几周,用 weeks)/'open'(没时间要求→按每天能学多久的节奏铺、并估算大概几周)。dailyMinutes 每天能学多久(分钟);skipWeekends=true 跳过周末,或 skipDays=[要跳过的周几0..6]。生成后写进按天排期,主人可在「本周计划表」里改或同意。",
  inputs: [
    { key: "mode", type: "string", required: false, desc: "deadline/until/weeks/open(默认:有考试日期就 deadline,否则 open)" },
    { key: "examDate", type: "string", required: false, desc: "考试日期 YYYY-MM-DD(mode=deadline)" },
    { key: "targetDate", type: "string", required: false, desc: "想学到的日期 YYYY-MM-DD(mode=until)" },
    { key: "weeks", type: "number", required: false, desc: "想用几周学完(mode=weeks)" },
    { key: "dailyMinutes", type: "number", required: false, desc: "每天大约能学多久(分钟),默认60" },
    { key: "skipWeekends", type: "boolean", required: false, desc: "true=跳过周末" },
    { key: "skipDays", type: "json", required: false, desc: "要跳过的周几数组JSON,0=周日..6=周六" },
  ],
  run: async (args, ctx) => {
    const exam = ctx.exam || _getExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    let skipDays = [];
    if (args && args.skipWeekends) skipDays = [0, 6];
    else if (args && args.skipDays != null) { try { skipDays = typeof args.skipDays === "string" ? JSON.parse(args.skipDays) : args.skipDays; } catch { skipDays = []; } }
    const r = buildStudyTimetable(ctx.user.id, exam, {
      mode: (args && args.mode) || (exam.exam_date ? "deadline" : "open"),
      examDate: (args && args.examDate) || exam.exam_date || null,
      targetDate: (args && args.targetDate) || null,
      weeks: (args && args.weeks) || null,
      dailyMinutes: (args && args.dailyMinutes) || 60,
      skipDays: Array.isArray(skipDays) ? skipDays.map(Number) : [],
      replace: true,
    });
    if (!r.ok) return { ok: false, note: r.note === "no_kps" ? "这门考试还没有知识点,先生成知识树再排。" : "没能生成计划。" };
    return { ok: true, unitCount: r.unitCount, perDay: r.perDay, endDate: r.endDate, weeksApprox: r.weeksApprox, hadDeadline: r.hadDeadline, hint: `已排好学习进程:共 ${r.unitCount} 个知识点、每天约 ${r.perDay} 个,到 ${r.endDate} 学完${r.hadDeadline ? "" : `(大概 ${r.weeksApprox} 周)`}。主人可在「本周计划表」改或同意。` };
  },
});
