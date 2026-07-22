// 砖头:让杀手给编程/实践类考试布置真实践作业(里程碑式,代码可自动判分)。
import { registerBrick } from "@/lib/bricks/registry";
import { getActiveExam } from "@/lib/db";
import { assignTask, listTasks, deleteTask, setPracticalMode, maybeAutoAssign, createAssignment, setTaskDue, updateAssignment } from "@/lib/practical";

// 多道一起布置时,给出【循序渐进、错峰】的截止日期:靠后的任务离最终期限更近,不再全挤同一天。
function staggerDues(dueStr, n) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const ymd = (base, days) => { const d = new Date(base); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  let endOff;
  if (dueStr && /^\d{4}-\d{2}-\d{2}$/.test(dueStr)) { const [y, m, d] = dueStr.split("-").map(Number); endOff = Math.max(1, Math.round((new Date(y, m - 1, d) - today) / 86400000)); }
  else endOff = n * 3; // 没给期限:每道约隔 3 天
  const startOff = Math.min(Math.max(1, Math.round(endOff / n)), endOff); // 第一道也留点时间、但不超过期限
  const out = [];
  for (let i = 0; i < n; i++) { const off = n === 1 ? endOff : Math.round(startOff + (endOff - startOff) * (i / (n - 1))); out.push(ymd(today, off)); }
  return out;
}

// 【硬超时】assignTask 每道要跑 2~4 次 AI 网络调用(embed 匹配知识点 + generateJson 生成里程碑),
// 而 generateJson 本身没有超时。Railway 是持久进程、心跳每 15s 刷新 updated_at,看门狗只在心跳停了才收尸——
// 所以一旦某次 AI 调用挂住,这一轮会【无限期卡在 running】,用户永远等不到任何汇报(v12 的 P5-11 就是如此)。
// 这里给每道任务加硬超时:宁可如实报"这道超时了",也不要让主人对着不动的"思考中"干等。
function withTimeout(p, ms, label) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout:${label}`)), ms))]);
}
const TASK_TIMEOUT_MS = 150000; // 单道 150s;多道并发时整体也不会拖过这个量级

registerBrick({
  name: "assign_practical_task", category: "practical", title: "布置一个实践作业(编程/实验)", write: true,
  description: "给当前考试布置一个【真去动手做】的实践作业:AI 把主题拆成里程碑,能跑的代码里程碑用 Judge0 自动判(测试用例),重型/非代码里程碑(如训练模型、做实验)走证据提交+AI审阅。用户说「给我布置个写快排的任务」「让我真去训个小模型看过拟合」等编程/实践类学习时用。topic 可空(空则围绕薄弱点/考试主题)。【要一次布置多道就传 topics 数组(JSON文本),一个调用建多道、只弹一次确认;别一道道分开反复调本工具——那样确认框会一个接一个弹个没完】。",
  inputs: [{ key: "topic", type: "string", required: false, desc: "单道任务的主题,如 用Python实现快排、训练nanoGPT观察过拟合" }, { key: "topics", type: "json", required: false, desc: "【多道一起】主题数组的JSON文本,如 [\"用Python写快排\",\"实现二分查找\",\"归并排序\"];一次最多6道。【务必按循序渐进的顺序排:最基础/最先做的放数组第一个,越靠后越进阶】——系统会据此给出渐进的截止日期(靠后的离最终期限更近,不会全挤同一天)。传了它就一次性建多道、只弹一次确认(优先用它而不是分多次调用)" }, { key: "dueDate", type: "string", required: false, desc: "截止日期 YYYY-MM-DD(主人说了什么时候前完成就填;用系统提示里的今天换算相对时间);多道时对所有这批任务生效" }],
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
      const dues = staggerDues(due, list.length); // 循序渐进:每道一个渐进的截止日期,别全同一天
      const settled = await Promise.all(list.map((tp, i) =>
        withTimeout(assignTask(ctx.user, exam, { topic: tp, dueDate: dues[i] }), TASK_TIMEOUT_MS, tp)
          .then((r) => ({ ok: true, topic: tp, r }))
          .catch((e) => ({ ok: false, topic: tp, err: String((e && e.message) || e).slice(0, 120) }))));
      const made = settled.filter((x) => x.ok).map((x) => x.r);
      const failed = settled.filter((x) => !x.ok);
      // 【绝不谎报】以前这里 .catch(()=>null) 吞掉每道失败,然后照样 return ok:true——
      // 全失败时 count=0 还说"已一次布置 0 道实践作业",杀手便如实转述"已布置好"。现在失败要如实说。
      if (!made.length) {
        return { ok: false, error: "all_failed", note: `这 ${list.length} 道实践作业【一道也没建成】(${failed.map((f) => f.topic + ":" + f.err).join(";").slice(0, 300)})。如实告诉主人没成功、别说已布置;可以问他要不要重试或减少道数。` };
      }
      return { ok: true, count: made.length, failedCount: failed.length, dueDate: due,
        tasks: made.map((r) => ({ taskId: r.taskId, title: r.title, milestones: (r.milestones || []).map((m) => `${m.title}(${m.check === "run" ? "代码自动判" : "证据审阅"})`) })),
        note: failed.length ? `注意:只成功建了 ${made.length} 道,另有 ${failed.length} 道失败(${failed.map((f) => f.topic).join("、")})——汇报时要如实说明哪几道没建成,别笼统说都布置好了。` : "",
        hint: `已布置 ${made.length} 道实践作业,用户到 /tasks 逐个做。` };
    }
    const r = await withTimeout(assignTask(ctx.user, exam, { topic: args && args.topic ? String(args.topic) : "", dueDate: due }), TASK_TIMEOUT_MS, "single");
    return { ok: true, taskId: r.taskId, title: r.title, dueDate: due, milestones: (r.milestones || []).map((m) => `${m.title}(${m.check === "run" ? "代码自动判" : "证据审阅"})`), hint: "用户可到 /tasks 页做这个任务、运行代码、提交判分。" };
  },
});

registerBrick({
  name: "list_practical_tasks", category: "practical", title: "列出实践作业及完成度", write: false,
  description: "列出当前考试的实践作业和每个的里程碑完成度。用户问「我的实践作业做到哪了」时用。",
  inputs: [],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    return { ok: true, tasks: listTasks(exam).map((tk) => ({ title: tk.title, done: tk.done, total: tk.milestoneCount })) };
  },
});

registerBrick({
  name: "add_assignment", category: "practical", title: "把上传的作业标成『作业助手型作业』", write: false,
  description: "当主人【上传/粘贴了一份作业(assignment/homework/project 说明)】、或说「这是我的作业,帮我记一下/建成作业」时用:把它建成一个【作业助手型作业】——它【没有里程碑、不自动判分】,只有一个能传/贴文件、聊天自动保存、实时记掌握度的『作业助手』陪主人做,主人做完点『标记完成』就清空聊天。title=作业名;brief=【把这份作业的要求/内容尽量完整地抄进来】(主人不在场也能据此帮他,所以要写全,不要只写一句);dueDate=截止日期 YYYY-MM-DD(有就填,用系统提示里的今天换算)。★这和 assign_practical_task(AI 出里程碑+代码判分)不同:主人【自己已经有一份作业要交】就用本工具,别硬拆里程碑。",
  inputs: [
    { key: "title", type: "string", required: true, desc: "作业名,如 CS229 Problem Set 3" },
    { key: "brief", type: "string", required: false, desc: "作业的完整要求/内容(尽量抄全,便于助手据此帮忙)" },
    { key: "dueDate", type: "string", required: false, desc: "截止日期 YYYY-MM-DD" },
  ],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    const r = await createAssignment(ctx.user, exam, { title: args && args.title, brief: args && args.brief, dueDate: args && args.dueDate });
    return { ok: true, taskId: r.taskId, title: r.title, dueDate: r.dueDate, hint: "已建成作业助手型作业,主人到 /tasks 打开就有『作业助手』陪他做(可传/贴文件),做完点标记完成。" };
  },
});

registerBrick({
  name: "update_assignment", category: "practical", title: "给已有的作业助手作业补上/更新具体要求(只改一个)", write: true,
  description: "当主人【后来又上传/粘贴了某个作业的具体要求文件】,而这个作业【之前已经建成作业助手作业】(比如从 syllabus 里先建了个只有名字的)时用:把这份要求的完整内容更新进【那一个】作业的 brief,让作业助手从此知道这份作业要做什么。★【只改匹配到的那一个作业,绝不动其它作业】。title=要更新的作业标题关键词(和现有作业名匹配,如 Problem Set 3);brief=这份作业要求的完整内容(尽量抄全);dueDate=截止 YYYY-MM-DD(有就更新)。若匹配不到已有作业,再考虑用 add_assignment 新建。",
  inputs: [
    { key: "title", type: "string", required: false, desc: "要更新的作业标题关键词(只有一个作业时可不填)" },
    { key: "brief", type: "string", required: false, desc: "作业要求的完整内容(抄全)" },
    { key: "dueDate", type: "string", required: false, desc: "截止日期 YYYY-MM-DD(可选)" },
  ],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    const r = updateAssignment(exam, { title: args && args.title, brief: args && args.brief, dueDate: args && args.dueDate });
    if (!r.ok) return { ok: false, note: r.note === "not_found" ? `没找到匹配「${args && args.title || ""}」的作业助手作业` : "本考试还没有作业助手作业", candidates: r.candidates };
    return { ok: true, title: r.title, hint: `已把这份要求更新进「${r.title}」,作业助手现在知道它了(其它作业没动)。` };
  },
});

registerBrick({
  name: "set_task_due", category: "practical", title: "改一个作业/项目的截止日期(只改这一处)", write: true,
  description: "【只改截止日期,别的都不动】主人说「把 XX 作业的截止改到 X 号」「这个项目 due 往后挪三天」时用:按标题关键词找到那一个作业(practical 或 assignment),【只更新它的截止日期】,【绝不】重排计划、重生成里程碑、动别的作业。title=作业标题关键词(只有一个作业时可不填);dueDate=新的截止 YYYY-MM-DD(用系统提示里的今天换算相对时间;主人说『去掉截止』就传空)。",
  inputs: [
    { key: "title", type: "string", required: false, desc: "要改的作业标题关键词(匹配最接近的一个)" },
    { key: "dueDate", type: "string", required: false, desc: "新的截止日期 YYYY-MM-DD(留空=去掉截止)" },
  ],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    const r = setTaskDue(exam, { title: args && args.title, dueDate: args && args.dueDate });
    if (!r.ok) return { ok: false, note: r.note === "not_found" ? `没找到匹配「${args && args.title || ""}」的作业` : "本考试还没有作业", candidates: r.candidates };
    return { ok: true, title: r.title, from: r.oldDue, to: r.dueDate, hint: `已把「${r.title}」的截止从 ${r.oldDue || "无"} 改成 ${r.dueDate || "无"},其它没动。` };
  },
});

registerBrick({
  name: "delete_practical_task", category: "practical", title: "删除一个实践作业", write: true,
  description: "删掉实践作业(编程/实验作业)。主人说「把那个快排作业删了」「删掉xx作业」「把实践作业都清了」时用。title=作业标题关键词(匹配最接近的一个删掉);all=true 删掉本考试全部实践作业。只有一个作业时可不填 title 直接删。",
  inputs: [{ key: "title", type: "string", required: false, desc: "要删的作业标题关键词(匹配最接近的一个)" }, { key: "all", type: "boolean", required: false, desc: "true=删掉本考试全部实践作业" }],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    const tasks = listTasks(exam);
    if (!tasks.length) return { ok: false, note: "现在没有实践作业可删" };
    if (args && args.all) { let n = 0; for (const t of tasks) { try { if (deleteTask(ctx.user, t.id)) n++; } catch {} } return { ok: true, deleted: n, note: `已删除全部 ${n} 个实践作业` }; }
    const kw = String((args && args.title) || "").toLowerCase().trim();
    let target = null;
    if (kw) target = tasks.find((t) => String(t.title || "").toLowerCase().includes(kw)) || tasks.find((t) => kw.includes(String(t.title || "").toLowerCase().slice(0, 12)));
    if (!target && tasks.length === 1) target = tasks[0];
    if (!target) return { ok: false, note: `没找到匹配「${kw}」的作业。现有:${tasks.map((t) => t.title).join("、")}——请说清删哪个,或说"全删"` };
    try { deleteTask(ctx.user, target.id); } catch { return { ok: false, note: "删除失败" }; }
    return { ok: true, deleted: 1, note: `已删除实践作业「${target.title}」` };
  },
});

registerBrick({
  name: "set_practical_mode", category: "practical", title: "切换【任务优先/边做边学】模式", write: true,
  description: "把当前考试切成【任务优先(边做边学)】模式:主要靠【做实践作业】(编程/项目/实验里程碑,代码用 Judge0 自动判)来学,今日任务里【少出甚至不出练习题】——只留复习 + 至多一条轻量练习,主线是做任务。适合 vibe coding、编程、动手技能这类『做中学』的目标(主人说「我要学 vibe coding」「主要想动手做项目、别老让我做题」等)。on=true 开启(会顺带确保有一个进行中的任务)、false 关闭回到常规出题。注意这只影响【今日任务怎么排/少出题】,不改出题引擎本身。",
  inputs: [{ key: "on", type: "boolean", required: true, desc: "true=开启任务优先, false=关闭" }],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    const on = args.on !== false;
    setPracticalMode(exam.id, ctx.user.id, on);
    let assigned = null;
    if (on) { try { assigned = maybeAutoAssign(ctx.user, exam); } catch {} }
    return { ok: true, on, note: on ? `已切到【任务优先】模式:以后主要靠做实践作业学,今日任务少出题${assigned ? ",已给你布置了第一个任务" : ""}。想回到常规做题,说一声「关掉任务优先」即可。` : "已关闭任务优先,回到常规出题练习。" };
  },
});
