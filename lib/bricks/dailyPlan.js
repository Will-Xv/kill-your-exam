// 砖头:按主人需求改今日任务 —— 基础用【当前跨考试规划逻辑】,叠加主人需求,再用【计划自我审视】优化,落成今日任务(custom)。
import { registerBrick } from "@/lib/bricks/registry";
import db, { getActiveExam, rootExamId } from "@/lib/db";
import { crossExamPlan } from "@/lib/planner";
import { reviewPlan } from "@/lib/planReview";
import { masteryMatrix } from "@/lib/mastery";
import { generateJson, langInstruction } from "@/lib/gemini";

registerBrick({
  name: "customize_daily_plan", category: "planning", write: true,
  title: "按主人需求改今日任务(规划逻辑+自我审视)",
  description: "当主人要【调整/定制今天的今日任务】(如「今天多练拉格朗日」「我只有30分钟」「别做自由练习」「重点攻某章」「今天少一点」「按我的情况重排一下今天」)时用。流程:①用当前跨考试规划(根因优先/含薄弱+未学/按时间分配)生成基础今日任务;②叠加主人的需求;③用计划自我审视挑掉低收益、修正排超;④落成今日任务(标记 custom,首页立即生效,可用 refresh_daily_plan 还原为自动)。不传 request=按当前逻辑+审视重排一次。这是【智能定制】;若只想精确指定几个知识点用旧的 set_daily_plan。",
  inputs: [
    { key: "request", type: "string", required: false, desc: "主人对今日任务的具体需求(大白话)" },
    { key: "minutes", type: "number", required: false, desc: "今天可用总分钟(可选)" },
  ],
  run: async (args, ctx) => {
    const user = ctx.user;
    const exam = getActiveExam(user.id);
    if (!exam) return { ok: false, reason: "no_exam" };
    const minutes = args.minutes ? Number(args.minutes) : undefined;
    let base = [];
    try {
      const cp = crossExamPlan(user.id, { totalMinutes: minutes });
      const rootId = rootExamId(exam.id);
      const e = (cp.exams || []).find((x) => Number(x.id) === Number(rootId)) || (cp.exams || []).find((x) => Number(x.id) === Number(exam.id));
      base = e && e.tasks ? e.tasks : [];
    } catch {}
    let mm = []; try { mm = masteryMatrix(exam.id); } catch {}
    const cand = mm.filter((k) => k.level === "weak" || k.level === "unlearned").slice(0, 40).map((k) => ({ id: k.id, title: k.title, level: k.level, root: !!k.rootCause }));
    let review = null; try { const r = await reviewPlan(user, { totalMinutes: minutes }); review = r.review || null; } catch {}
    const baseDesc = base.map((t) => t.type === "kp" ? `知识点:${t.title}` : t.type === "review" ? "复习到期错题" : "自由练习").join("; ") || "(空)";
    const reviewDesc = review ? `总评「${review.summary || ""}」;${review.overScheduled && review.overScheduled.over ? "排超了—" + (review.overScheduled.detail || "") + ";" : ""}建议砍:${(review.trim || []).map((x) => x.task).join("、") || "无"};建议今天约${review.revisedMinutes || "?"}分钟。` : "(无)";
    const prompt = `你在帮考生【定制今天的今日任务】。综合下面三样,输出【最终】今日任务:
【基础任务(系统按数据生成)】${baseDesc}
【计划自我审视】${reviewDesc}
【考生的需求】${(args.request || "(没有特别需求,就按基础+审视重排一次:砍掉低收益、别排太多)").slice(0, 500)}
【可选知识点(只能从这里按 id 选,别编)】
${cand.map((k) => `[${k.id}] ${k.title}(${k.level}${k.root ? "·根因" : ""})`).join("\n") || "(无候选)"}
规则:①优先满足考生明确需求;②没被需求否掉时,尊重审视的"砍低收益/别排超";③知识点只能从上面清单选 id(1~4个,根因优先);④includeReview=是否含"复习到期错题"(默认是,除非考生说不复习);⑤freeTarget=自由练习题数(默认10,考生说不练就0)。` + langInstruction(user.lang);
    let out;
    try {
      out = await generateJson(prompt, { type: "object", properties: {
        kpIds: { type: "array", items: { type: "integer" } },
        includeReview: { type: "boolean" },
        freeTarget: { type: "integer" },
        note: { type: "string" },
      }, required: ["kpIds"] });
    } catch { out = { kpIds: base.filter((t) => t.type === "kp").map((t) => t.kpId), includeReview: true, freeTarget: 10 }; }
    const validIds = new Set(cand.map((k) => k.id));
    const titleById = new Map(cand.map((k) => [k.id, k.title]));
    const kpIds = (out.kpIds || []).map(Number).filter((id) => validIds.has(id)).slice(0, 4);
    const items = [];
    if (out.includeReview !== false) items.push({ type: "review" });
    for (const id of kpIds) items.push({ type: "kp", kpId: id, title: titleById.get(id) });
    const ft = out.freeTarget != null ? Number(out.freeTarget) : 10;
    if (ft > 0) items.push({ type: "free", target: ft });
    if (!items.length) items.push({ type: "review" });
    const today = new Date().toLocaleDateString("sv-SE");
    db.prepare("DELETE FROM daily_plans WHERE exam_id=? AND date=?").run(exam.id, today);
    db.prepare("INSERT INTO daily_plans(exam_id,date,items_json,completed,custom) VALUES(?,?,?,0,1)").run(exam.id, today, JSON.stringify(items));
    return { ok: true, note: out.note || `已按你的需求重排今日任务:${kpIds.map((id) => titleById.get(id)).join("、") || "复习 + 自由练习"}`, tasks: items.map((i) => i.type === "kp" ? i.title : i.type === "review" ? "复习到期错题" : `自由练习×${ft}`) };
  },
});
