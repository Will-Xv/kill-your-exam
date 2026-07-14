// 砖头:让杀手给编程/实践类考试布置真实践任务(里程碑式,代码可自动判分)。
import { registerBrick } from "@/lib/bricks/registry";
import { getActiveExam } from "@/lib/db";
import { assignTask, listTasks } from "@/lib/practical";

registerBrick({
  name: "assign_practical_task", category: "practical", title: "布置一个实践任务(编程/实验)", write: true,
  description: "给当前考试布置一个【真去动手做】的实践任务:AI 把主题拆成里程碑,能跑的代码里程碑用 Judge0 自动判(测试用例),重型/非代码里程碑(如训练模型、做实验)走证据提交+AI审阅。用户说「给我布置个写快排的任务」「让我真去训个小模型看过拟合」等编程/实践类学习时用。topic 可空(空则围绕薄弱点/考试主题)。",
  inputs: [{ key: "topic", type: "string", required: false, desc: "任务主题,如 用Python实现快排、训练nanoGPT观察过拟合" }],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    const r = await assignTask(ctx.user, exam, { topic: args && args.topic ? String(args.topic) : "" });
    return { ok: true, taskId: r.taskId, title: r.title, milestones: (r.milestones || []).map((m) => `${m.title}(${m.check === "run" ? "代码自动判" : "证据审阅"})`), hint: "用户可到 /tasks 页做这个任务、运行代码、提交判分。" };
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
