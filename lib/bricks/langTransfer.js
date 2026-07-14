// 砖头(类16):让杀手管理三语迁移追踪——设置语言背景、分析迁移错误、预测迁移陷阱。
import { registerBrick } from "@/lib/bricks/registry";
import { getActiveExam } from "@/lib/db";
import { getLangBackground, setLangBackground, analyzeTransfers, predictTransfer, transferSummary, SOURCE_LABEL } from "@/lib/langTransfer";

registerBrick({
  name: "lang_background_set", category: "language", title: "设置/查看语言背景", write: true,
  description: "查看或设置用户的语言背景(母语、已经会的外语、正在学的目标语),用于三语迁移分析。用户说「我母语中文,会英语,在学西班牙语」之类时用。不传参数=只查看当前背景。",
  inputs: [
    { key: "native", type: "string", required: false, desc: "母语,如 中文" },
    { key: "known", type: "string", required: false, desc: "已会外语,逗号分隔,如 英语,法语" },
    { key: "target", type: "string", required: false, desc: "正在学的目标语,如 西班牙语" },
  ],
  run: async (args, ctx) => {
    if (args && (args.native || args.known || args.target)) {
      const cur = getLangBackground(ctx.user.id);
      const known = args.known != null ? String(args.known).split(/[,，、]/).map((x) => x.trim()).filter(Boolean) : cur.known;
      const bg = setLangBackground(ctx.user.id, { native: args.native ?? cur.native, known, target: args.target ?? cur.target });
      return { ok: true, updated: true, background: bg };
    }
    return { ok: true, updated: false, background: getLangBackground(ctx.user.id) };
  },
});

registerBrick({
  name: "lang_transfer_analyze", category: "language", title: "分析迁移错误并更新三语对照表", write: true,
  description: "对当前语言考试里做错的题做一次【迁移归因】:判断每个错误是母语负迁移、二外负迁移、目标语内部混淆还是粗心,并把有价值的对照点沉淀成三语对照表(母语直觉/已会外语/目标语/易踩的坑)。用户说「帮我看看我的错都是哪种迁移」「更新一下对照表」时用。需要先有做错的语言题。",
  inputs: [],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    const r = await analyzeTransfers(ctx.user, exam, {});
    const sum = transferSummary(exam);
    const dist = Object.entries(sum.counts).filter(([, n]) => n > 0).map(([k, n]) => `${SOURCE_LABEL[k] || k}:${n}`);
    return { ok: true, newlyAnalyzed: r.analyzed || 0, contrastAdded: r.contrastAdded || 0, distribution: dist, contrastRows: sum.contrast.length, reason: r.reason };
  },
});

registerBrick({
  name: "lang_transfer_predict", category: "language", title: "预测某主题的迁移陷阱", write: false,
  description: "在学某个语言主题之前,根据用户的语言背景预测最可能踩的负迁移陷阱、以及可以借力的正迁移。用户说「我要学虚拟式,提前提醒我会踩哪些坑」时用。",
  inputs: [{ key: "topic", type: "string", required: true, desc: "要学的主题,如 虚拟式、过去时变位" }],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    if (!args || !args.topic) throw new Error("缺少 topic");
    const r = await predictTransfer(ctx.user, exam, String(args.topic));
    return { ok: true, negatives: (r.negatives || []).map((x) => `${x.point}${x.from ? "(来自" + x.from + ")" : ""}`), positives: (r.positives || []).map((x) => `${x.point}${x.from ? "(来自" + x.from + ")" : ""}`), tip: r.tip };
  },
});
