// 砖头:让杀手给编程/实践类考试布置真实践任务(里程碑式,代码可自动判分)。
import { registerBrick } from "@/lib/bricks/registry";
import { getActiveExam } from "@/lib/db";
import { assignTask, listTasks, setPracticalMode, maybeAutoAssign } from "@/lib/practical";

registerBrick({
  name: "assign_practical_task", category: "practical", title: "布置一个实践任务(编程/实验)", write: true,
  description: "给当前考试布置一个【真去动手做】的实践任务:AI 把主题拆成里程碑,能跑的代码里程碑用 Judge0 自动判(测试用例),重型/非代码里程碑(如训练模型、做实验)走证据提交+AI审阅。用户说「给我布置个写快排的任务」「让我真去训个小模型看过拟合」等编程/实践类学习时用。topic 可空(空则围绕薄弱点/考试主题)。【要一次布置多道就传 topics 数组(JSON文本),一个调用建多道、只弹一次确认;别一道道分开反复调本工具——那样确认框会一个接一个弹个没完】。",
  inputs: [{ key: "topic", type: "string", required: false, desc: "单道任务的主题,如 用Python实现快排、训练nanoGPT观察过拟合" }, { key: "topics", type: "json", required: false, desc: "【多道一起】主题数组的JSON文本,如 [\"用Python写快排\",\"实现二分查找\",\"归并排序\"];一次最多6道。传了它就一次性建多道、只弹一次确认(优先用它而不是分多次调用)" }, { key: "dueDate", type: "string", required: false, desc: "截止日期 YYYY-MM-DD(主人说了什么时候前完成就填;用系统提示里的今天换算相对时间);多道时对所有这批任务生效" }],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    const due = args && args.dueDate ? String(args.dueDate) : null;
    // 多道一起:topics 传了数组(可能是 JSON 文本)就一次性建多道——只弹一次确认(本工具一次调用=一个确认)
    let topics = null;
    if (args && args.topics != null) {
      try { topics = typeof args.topics === "string" ? JSON.parse(args.topics) : args.topics; } catch { topics = null; }
    }
    if (Array.isArray(topics) && topics.length) {
      const list = topics.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 6);
      const results = await Promise.all(list.map((tp) => assignTask(ctx.user, exam, { topic: tp, dueDate: due }).catch(() => null)));
      const made = results.filter(Boolean);
      return { ok: true, count: made.length, dueDate: due, tasks: made.map((r) => ({ taskId: r.taskId, title: r.title, milestones: (r.milestones || []).map((m) => `${m.title}(${m.check === "run" ? "代码自动判" : "证据审阅"})`) })), hint: `已一次布置 ${made.length} 道实践任务,用户到 /tasks 逐个做。` };
    }
    const r = await assignTask(ctx.user, exam, { topic: args && args.topic ? String(args.topic) : "", dueDate: due });
    return { ok: true, taskId: r.taskId, title: r.title, dueDate: due, milestones: (r.milestones || []).map((m) => `${m.title}(${m.check === "run" ? "代码自动判" : "证据审阅"})`), hint: "用户可到 /tasks 页做这个任务、运行代码、提交判分。" };
  },
});

registerBrick({
  name: "list_practical_tasks", category: "practical", title: "列出实践任务及完成度", write: false,
  description: "列出当前考试的实践任务和每个的里程碑完成度。用户问「我的实践任务做到哪了」时用。",
  inputs: [],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    return { ok: true, tasks: listTasks(exam).map((tk) => ({ title: tk.title, done: tk.done, total: tk.milestoneCount })) };
  },
});

registerBrick({
  name: "set_practical_mode", category: "practical", title: "切换【任务优先/边做边学】模式", write: true,
  description: "把当前考试切成【任务优先(边做边学)】模式:主要靠【做实践任务】(编程/项目/实验里程碑,代码用 Judge0 自动判)来学,今日任务里【少出甚至不出练习题】——只留复习 + 至多一条轻量练习,主线是做任务。适合 vibe coding、编程、动手技能这类『做中学』的目标(主人说「我要学 vibe coding」「主要想动手做项目、别老让我做题」等)。on=true 开启(会顺带确保有一个进行中的任务)、false 关闭回到常规出题。注意这只影响【今日任务怎么排/少出题】,不改出题引擎本身。",
  inputs: [{ key: "on", type: "boolean", required: true, desc: "true=开启任务优先, false=关闭" }],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    const on = args.on !== false;
    setPracticalMode(exam.id, ctx.user.id, on);
    let assigned = null;
    if (on) { try { assigned = maybeAutoAssign(ctx.user, exam); } catch {} }
    return { ok: true, on, note: on ? `已切到【任务优先】模式:以后主要靠做实践任务学,今日任务少出题${assigned ? ",已给你布置了第一个任务" : ""}。想回到常规做题,说一声「关掉任务优先」即可。` : "已关闭任务优先,回到常规出题练习。" };
  },
});
