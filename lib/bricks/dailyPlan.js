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
  description: "当主人要【调整/定制今天的今日任务】(如「今天多练拉格朗日」「我只有30分钟」「别做自由练习」「重点攻某章」「今天少一点」「按我的情况重排一下今天」)时用。流程:①用当前跨考试规划(根因优先/含薄弱+未学/按时间分配)生成基础今日任务;②叠加主人的需求;③用计划自我审视挑掉低收益、修正排超;④落成今日任务(标记 custom,首页立即生效,可用 refresh_daily_plan 还原为自动)。主人若要【有顺序的仪式】(如「今天先做3道问答→围绕X辩论2轮→对不会的做苏格拉底引导→排进复习」),本砖会产出【有序步骤】(练习/辩论/苏格拉底/学习/复习/自由练习),首页按顺序显示、逐个可点开。不传 request=按当前逻辑+审视重排一次。这是【智能定制】;若只想精确指定几个知识点用旧的 set_daily_plan。",
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
规则:①优先满足考生明确需求;②没被需求否掉时,尊重审视的"砍低收益/别排超";③知识点只能从上面清单选 id,别编。
【两种输出,二选一】
A. 若考生要【有顺序的多步仪式】(明确说了先做什么再做什么,或点名了辩论/苏格拉底/问答等玩法的顺序)→ 填 steps:一个【有序】数组,每步 {type, kpId, n}。type 取值:
   - "practice"=围绕某知识点做问答/练习题(需 kpId;n=题数),
   - "debate"=围绕某知识点辩论(需 kpId;n=轮数),
   - "socratic"=对某知识点做苏格拉底式引导(需 kpId),
   - "explore"=topic-first 自由探索某知识点(考生自由发问、AI 按深浅自适应引导;需 kpId),
   - "study"=学习某知识点(需 kpId),
   - "review"=复习到期错题(不需 kpId),
   - "free"=自由练习(n=题数)。
   按考生说的顺序排;kpId 只能从候选清单选。填了 steps 就【不要】再填 kpIds/includeReview/freeTarget。
B. 若考生只是想【简单重排/换几个知识点/删掉自由练习】(没有顺序要求)→ steps 留空数组,改填:kpIds(1~4个,根因优先)、includeReview(默认true,说不复习就false)、freeTarget(默认10,说不练就0)。` + langInstruction(user.lang);
    let out;
    try {
      out = await generateJson(prompt, { type: "object", properties: {
        steps: { type: "array", items: { type: "object", properties: {
          type: { type: "string", enum: ["practice", "debate", "socratic", "explore", "study", "review", "free"] },
          kpId: { type: "integer" },
          n: { type: "integer" },
        }, required: ["type"] } },
        kpIds: { type: "array", items: { type: "integer" } },
        includeReview: { type: "boolean" },
        freeTarget: { type: "integer" },
        note: { type: "string" },
      } });
    } catch { out = { kpIds: base.filter((t) => t.type === "kp").map((t) => t.kpId), includeReview: true, freeTarget: 10 }; }
    const validIds = new Set(cand.map((k) => k.id));
    const titleById = new Map(cand.map((k) => [k.id, k.title]));
    const items = [];
    let summaryTasks = [];
    const steps = Array.isArray(out.steps) ? out.steps : [];
    if (steps.length) {
      // 有序仪式:按主人顺序落成
      for (const st of steps.slice(0, 12)) {
        const kt = st.kpId != null ? Number(st.kpId) : null;
        const needsKp = ["practice", "debate", "socratic", "explore", "study"].includes(st.type);
        if (needsKp) {
          if (!validIds.has(kt)) continue;
          const title = titleById.get(kt);
          const it = { type: st.type === "study" ? "kp" : st.type, kpId: kt, title };
          if (st.n != null) it.n = Number(st.n);
          items.push(it);
          summaryTasks.push(`${st.type === "debate" ? "辩论" : st.type === "socratic" ? "苏格拉底" : st.type === "explore" ? "探索" : st.type === "study" ? "学" : "练"}·${title}${st.n ? "×" + st.n : ""}`);
        } else if (st.type === "review") {
          items.push({ type: "review" }); summaryTasks.push("复习到期错题");
        } else if (st.type === "free") {
          const n = st.n != null ? Number(st.n) : 10;
          if (n > 0) { items.push({ type: "free", target: n }); summaryTasks.push(`自由练习×${n}`); }
        }
      }
    }
    let ft = 10;
    if (!items.length) {
      // 简单重排回退路径
      const kpIds = (out.kpIds || []).map(Number).filter((id) => validIds.has(id)).slice(0, 4);
      if (out.includeReview !== false) { items.push({ type: "review" }); summaryTasks.push("复习到期错题"); }
      for (const id of kpIds) { items.push({ type: "kp", kpId: id, title: titleById.get(id) }); summaryTasks.push(titleById.get(id)); }
      ft = out.freeTarget != null ? Number(out.freeTarget) : 10;
      if (ft > 0) { items.push({ type: "free", target: ft }); summaryTasks.push(`自由练习×${ft}`); }
    }
    if (!items.length) { items.push({ type: "review" }); summaryTasks.push("复习到期错题"); }
    const today = new Date().toLocaleDateString("sv-SE");
    db.prepare("DELETE FROM daily_plans WHERE exam_id=? AND date=?").run(exam.id, today);
    db.prepare("INSERT INTO daily_plans(exam_id,date,items_json,completed,custom) VALUES(?,?,?,0,1)").run(exam.id, today, JSON.stringify(items));
    return { ok: true, note: out.note || `已按你的需求重排今日任务(共${items.length}步):${summaryTasks.join(" → ")}`, tasks: summaryTasks };
  },
});
