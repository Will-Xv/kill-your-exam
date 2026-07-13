// 砖头(类11):让杀手能【立即跑一次跨章节根因诊断】以及【调整自动触发的开关/间隔】。
// 平时是"累计使用时长满阈值(默认2h)自动跑";用户也可以让杀手现在就跑,或改间隔(下限1.5h)/关掉。
import { registerBrick } from "@/lib/bricks/registry";
import { runRootCauseDiagnosis, getDiagnosisConfig, setDiagnosisConfig } from "@/lib/diagnose";
import { getActiveExam } from "@/lib/db";

registerBrick({
  name: "diagnose_root_cause", category: "diagnosis", title: "立即跑一次跨章节根因诊断", write: true,
  description: "现在就对【当前考试】做一次跨章节根因分析:找出真正拖垮成绩的根因知识点、反复的错误模式、是否在逃避最难内容。会给根因知识点在掌握度矩阵加醒目标记、写进长期记忆,并在首页弹出提醒。平时它会在累计使用时长满阈值时自动跑,这个 brick 用于用户明确要求「现在帮我诊断」时立刻执行。",
  inputs: [],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    const r = await runRootCauseDiagnosis(ctx.user, exam.id);
    if (!r.diagnosis) return { ok: false, reason: r.reason || "no_data", note: "数据还不够(先做一些练习/讨论)" };
    const d = r.diagnosis;
    return { ok: true, summary: d.summary, rootCauses: (d.rootCauses || []).map((x) => x.title), errorPatterns: (d.errorPatterns || []).map((x) => x.name), avoiding: !!d.avoidance?.avoiding };
  },
});

registerBrick({
  name: "diagnose_config", category: "diagnosis", title: "查看/调整根因诊断的自动触发", write: true,
  description: "查看或修改「根因诊断自动触发」的设置:enabled=是否自动触发;intervalMinutes=累计使用多少分钟自动跑一次(下限 90 分钟,低于会被抬到 90)。不传参数=只查看当前设置。用于用户说「关掉自动诊断」「改成每 2 小时/每 3 小时诊断一次」等。",
  inputs: [
    { key: "enabled", type: "boolean", required: false, desc: "是否自动触发(true/false)" },
    { key: "intervalMinutes", type: "number", required: false, desc: "累计使用多少分钟跑一次(下限 90)" },
  ],
  run: async (args, ctx) => {
    if (args && (typeof args.enabled === "boolean" || args.intervalMinutes != null)) {
      const cfg = setDiagnosisConfig(ctx.user.id, { enabled: args.enabled, intervalMinutes: args.intervalMinutes });
      return { ok: true, updated: true, ...cfg };
    }
    return { ok: true, updated: false, ...getDiagnosisConfig(ctx.user.id) };
  },
});
