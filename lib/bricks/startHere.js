// 砖头(类1):让杀手回答「我该从哪开始」。
import { registerBrick } from "@/lib/bricks/registry";
import { getActiveExam } from "@/lib/db";
import { whereToStart } from "@/lib/startHere";

registerBrick({
  name: "where_to_start", category: "diagnosis", title: "极简诊断:我该从哪开始", write: false,
  description: "回答「我完全不知道自己会什么/该从哪开始」:读掌握度数据,数据太薄就给一份广度抽样(先花几分钟测底子),有数据就指出哪些章已稳可略过、从哪章的哪个点开始、第一步做什么。用户说「从哪开始」「我不知道自己会啥」「帮我定个起点」时用。",
  inputs: [{ key: "minutes", type: "number", required: false, desc: "可用几分钟(题数随之缩放;想最全面就建议做模拟考)" }],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    return { ok: true, ...whereToStart(exam, { minutes: args.minutes }) };
  },
});
