// 砖头(Workflow Recipe MVP-1):让杀手把用户的自然语言学习流程,变成一套【多阶段配方】,
// 之后 planner/今日任务据此按阶段选方法。dev 门控(未 seed published)。
import { registerBrick } from "@/lib/bricks/registry";
import db, { getActiveExam } from "@/lib/db";
import { generateJson, langInstruction } from "@/lib/gemini";
import { leafKpList } from "@/lib/mastery";
import { saveRecipe, listRecipes, activateRecipe, getActiveRecipe, currentPhase, recipeProgress } from "@/lib/recipes";

const PHASE_SCHEMA = {
  type: "object", properties: {
    goal: { type: "string" },
    phases: { type: "array", items: { type: "object", properties: {
      id: { type: "string" }, name: { type: "string" },
      selector: { type: "object", properties: { type: { type: "string", enum: ["chapters", "kp_ids", "weak", "all"] }, value: { type: "array", items: { type: "string" } } }, required: ["type"] },
      method: { type: "object", properties: { type: { type: "string", enum: ["practice", "socratic", "debate", "explain_first", "custom_mode", "ai_choose"] }, modeId: { type: "integer" }, candidates: { type: "array", items: { type: "string" }, description: "type=ai_choose 时,从这些方法里按前面阶段的效果自动选" } }, required: ["type"] },
      exit: { type: "object", properties: { type: { type: "string", enum: ["mastery_ge", "accuracy_ge", "manual"] }, level: { type: "string", enum: ["ok", "mastered"] }, pct: { type: "integer" } } },
    }, required: ["name", "selector", "method"] } },
    rules: { type: "string" },
  }, required: ["phases" ],
};

registerBrick({
  name: "recipe_save", category: "recipe", title: "把自然语言学习流程存成多阶段配方", write: true,
  description: "把用户用大白话描述的一整套学习流程(如'前三章用练习题、中三章苏格拉底式引导、后三章AI按表现选;每章达到掌握再进下一章')转成一套【多阶段配方(recipe)】并激活。之后今日任务/planner 会按当前阶段决定每个知识点用什么方法学。selector 用 chapters(章节名)/kp_ids/weak/all;method 用 practice/socratic/debate/explain_first/custom_mode/ai_choose;exit 用 mastery_ge(level ok|mastered)/accuracy_ge/manual。用户说'以后这门课这样学/规划一下学习流程/分阶段用不同方法'时用。",
  inputs: [
    { key: "name", type: "string", required: true, desc: "配方名,如 分阶段攻克" },
    { key: "description", type: "string", required: true, desc: "用户的自然语言学习流程(原话尽量保留)" },
  ],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    if (!args || !args.name || !args.description) throw new Error("缺少 name 或 description");
    const kps = leafKpList(exam.id);
    const chapters = [...new Set(kps.map((k) => k.chapter).filter(Boolean))];
    const spec = await generateJson(
      `把下面这段【学习流程】转成一套多阶段配方。这门考试「${exam.name}」的章节:${chapters.join("、") || "(未分章)"}。
学习流程(用户原话):${String(args.description).slice(0, 1500)}
规则:每个 phase 给 name、selector(覆盖哪些知识点:type=chapters时 value 填章节名/type=weak 表示薄弱点/type=all 全部)、method(用什么方式学)、exit(何时进下一阶段,默认 mastery_ge level=ok)。若用户说"AI按表现选"就用 method.type=ai_choose。goal 填一句话目标。忠于用户描述,别乱加阶段。` + langInstruction(ctx.user.lang),
      PHASE_SCHEMA
    );
    spec.goal = spec.goal || args.description.slice(0, 120);
    const r = saveRecipe(ctx.user.id, exam.id, { name: args.name, description: args.description, spec, scope: "exam", activate: true });
    const cur = currentPhase({ spec }, exam.id);
    return { ok: true, recipeId: r.id, version: r.version, phases: (spec.phases || []).map((p, i) => `${i + 1}. ${p.name}[${p.selector?.type}·${p.method?.type}]`), currentPhase: cur ? cur.phase.name : null };
  },
});

registerBrick({
  name: "recipe_activate", category: "recipe", title: "激活/停用一个配方", write: true,
  description: "按名字激活或停用一个学习配方。active=true 激活、false 停用。",
  inputs: [{ key: "name", type: "string", required: true, desc: "配方名" }, { key: "active", type: "boolean", required: true, desc: "true 激活/false 停用" }],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    const list = listRecipes(ctx.user.id, exam ? exam.id : null);
    const rc = list.find((x) => x.name === args.name);
    if (!rc) throw new Error("没有这个配方");
    activateRecipe(ctx.user.id, rc.id, !!args.active);
    return { ok: true, name: rc.name, active: !!args.active };
  },
});

registerBrick({
  name: "recipe_status", category: "recipe", title: "看当前配方进行到哪个阶段", write: false,
  description: "查看当前考试生效的学习配方、现在第几阶段、每阶段用什么方法(ai_choose 会显示自动选的)、以及各方法的【效果(掌握度增益)】和目前表现最好的方法。用户问'我到哪个阶段了/哪种方法对我最有效'时用。",
  inputs: [],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    const recipe = getActiveRecipe(ctx.user.id, exam.id);
    if (!recipe) return { ok: true, active: false, note: "这门考试没有激活的学习配方" };
    const prog = recipeProgress(recipe, exam.id);
    return {
      ok: true, active: true, recipe: recipe.name, allDone: prog.allDone,
      currentPhase: (prog.curIndex + 1) + "/" + prog.phases.length,
      phases: prog.phases.map((p) => `${p.index + 1}.${p.name}[${p.method}${p.aiChosen ? "·AI选" : ""}]${p.status === "done" ? "✓" : p.status === "current" ? "◀在此" : ""}${typeof p.gain === "number" ? " 增益" + p.gain : ""}`),
      effectiveness: prog.effectiveness,
      bestMethod: prog.bestMethod,
    };
  },
});

registerBrick({
  name: "recipe_list", category: "recipe", title: "列出学习配方", write: false,
  description: "列出这门考试和全局的学习配方及是否激活。",
  inputs: [],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    return { ok: true, recipes: listRecipes(ctx.user.id, exam ? exam.id : null).map((r) => `${r.name}(${r.scope}${r.active ? "·激活" : ""}·v${r.version})`) };
  },
});

import { proposeResegment, applyResegment } from "@/lib/recipeRemap";

registerBrick({
  name: "recipe_resegment_preview", category: "recipe", title: "重切知识结构·预览影响(不改动)", write: false,
  description: "MVP-3:按指令把当前考试的知识点【重新分组】(如'按逻辑主题重组''按难度分段'),先【只预览】会怎么重组、以及影响面:多少作答/错题/复习任务会迁移、有没有旧点没匹配到新点、哪些不受影响。【不改动任何数据】,只生成并暂存提案。用户说'把知识点按逻辑重新分段/重组结构'时,先用它给用户看 diff 再确认。",
  inputs: [{ key: "instruction", type: "string", required: true, desc: "怎么重组,如 按逻辑主题重组、按难度分三段" }],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    if (!args || !args.instruction) throw new Error("缺少 instruction");
    const r = await proposeResegment(ctx.user, exam, String(args.instruction));
    if (r.error) return { ok: false, reason: r.error, count: r.count };
    return { ok: true, ...r, next: "用户确认后,用 recipe_resegment_apply 执行(会先自动打回档点,可回退)。" };
  },
});

registerBrick({
  name: "recipe_resegment_apply", category: "recipe", title: "重切知识结构·执行(打回档点+语义迁移)", write: true,
  description: "MVP-3:执行【上一步预览过的】知识结构重切。会先自动打一个回档点,再建新结构,并把旧知识点的作答/错题/复习按语义映射迁移到新点(原始作答记录保留、不删)。用户【确认了预览的影响】之后才用。不满意可用 rollback / 到「回档」页一键还原。",
  inputs: [],
  run: async (args, ctx) => {
    const exam = ctx.exam || getActiveExam(ctx.user.id);
    if (!exam) throw new Error("没有当前考试");
    const r = await applyResegment(ctx.user, exam);
    if (r.error) return { ok: false, reason: r.error, note: r.note };
    return { ok: true, ...r };
  },
});
