// 砖头:按主人需求改今日任务 —— 基础用【当前跨考试规划逻辑】,叠加主人需求,再用【计划自我审视】优化,落成今日任务(custom)。
import { registerBrick } from "@/lib/bricks/registry";
import db, { getActiveExam, rootExamId } from "@/lib/db";
import { crossExamPlan, currentDailyItems } from "@/lib/planner";
import { tweakRecipeCounts } from "@/lib/recipes";
import { reviewPlan } from "@/lib/planReview";
import { masteryMatrix } from "@/lib/mastery";
import { generateJson, langInstruction } from "@/lib/gemini";
import { todayStr } from "@/lib/devtime";

registerBrick({
  name: "customize_daily_plan", category: "planning", write: true,
  title: "按主人需求改今日任务(规划逻辑+自我审视)",
  description: "当主人要【调整/定制今天的今日任务】(如「今天多练拉格朗日」「我只有30分钟」「别做自由练习」「重点攻某章」「今天少一点」「按我的情况重排一下今天」)时用。流程:①用当前跨考试规划(根因优先/含薄弱+未学/按时间分配)生成基础今日任务;②叠加主人的需求;③用计划自我审视挑掉低收益、修正排超;④落成今日任务(标记 custom,首页立即生效,可用 refresh_daily_plan 还原为自动)。主人若要【有顺序的仪式】(如「今天先做3道问答→围绕X辩论2轮→对不会的做苏格拉底引导→排进复习」),本砖会产出【有序步骤】(练习/辩论/苏格拉底/学习/复习/自由练习),首页按顺序显示、逐个可点开。不传 request=按当前逻辑+审视重排一次。这是【智能定制】(会重挑知识点、跑 AI、较慢);若只是【改题数/轮数】这类纯数字微调,改用更快的 tweak_daily_plan(就地改、不重排、不重挑知识点);若只想精确指定几个知识点用旧的 set_daily_plan。",
  inputs: [
    { key: "request", type: "string", required: false, desc: "主人对今日任务的具体需求(大白话)" },
    { key: "minutes", type: "number", required: false, desc: "今天可用总分钟(可选)" },
  ],
  run: async (args, ctx) => {
    const user = ctx.user;
    const exam = getActiveExam(user.id);
    if (!exam) return { ok: false, reason: "no_exam" };
    const minutes = args.minutes ? Number(args.minutes) : undefined;
    // 【P4-11】基础任务用【当前真实生效的今日任务】(含之前微调过的题数),不要重新从规划器现拉一份——
    // 否则主人只是让你"改个顺序",题数也会被重新拍脑袋定一遍,把上一步刚调好的数字悄悄覆盖掉。
    let base = [];
    try { const cur = currentDailyItems(user.id, exam); base = (cur && cur.items) || []; } catch {}
    let mm = []; try { mm = masteryMatrix(exam.id); } catch {}
    const cand = mm.filter((k) => k.level === "weak" || k.level === "unlearned").slice(0, 40).map((k) => ({ id: k.id, title: k.title, level: k.level, root: !!k.rootCause }));
    let review = null; try { const r = await reviewPlan(user, { totalMinutes: minutes }); review = r.review || null; } catch {}
    const baseDesc = base.map((t) => {
      if (t.type === "review") return "复习到期错题";
      if (t.type === "free") return `自由练习薄弱点(${t.target != null ? t.target : 10}题)`;
      if (t.type === "newkp") return t.cycleDone ? "学新知识(本周期已学完)" : `学新知识:${t.title || ""}(今日建议${t.dailyTarget != null ? t.dailyTarget : 6}题)`;
      if (t.type === "kp") return `知识点:${t.title}${t.n != null ? `(${t.n}题)` : ""}`;
      return `${t.type}:${t.title || ""}${t.n != null ? `(${t.n})` : ""}`;
    }).join("; ") || "(空)";
    const reviewDesc = review ? `总评「${review.summary || ""}」;${review.overScheduled && review.overScheduled.over ? "排超了—" + (review.overScheduled.detail || "") + ";" : ""}建议砍:${(review.trim || []).map((x) => x.task).join("、") || "无"};建议今天约${review.revisedMinutes || "?"}分钟。` : "(无)";
    const prompt = `你在帮考生【定制今天的今日任务】。综合下面三样,输出【最终】今日任务:
【基础任务(系统按数据生成)】${baseDesc}
【计划自我审视】${reviewDesc}
【考生的需求】${(args.request || "(没有特别需求,就按基础+审视重排一次:砍掉低收益、别排太多)").slice(0, 500)}
【可选知识点(只能从这里按 id 选,别编)】
${cand.map((k) => `[${k.id}] ${k.title}(${k.level}${k.root ? "·根因" : ""})`).join("\n") || "(无候选)"}
规则:①优先满足考生明确需求;②没被需求否掉时,尊重审视的「砍低收益/别排超」;③知识点只能从上面清单选 id,别编。
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
B. 若考生只是想【简单重排/换几个知识点/删掉自由练习】(没有顺序要求)→ steps 留空数组,改填:kpIds(1~4个,根因优先)、includeReview(默认true,说不复习就false)、freeTarget(默认10,说不练就0)、perKpN(每个知识点做几道题)。★若考生给了【可用时间】:用它决定题量——约每题 2~3 分钟,先给复习留一点,其余按知识点均分成 perKpN(2~6);时间紧就【少排知识点+少出题】,别硬塞满。` + langInstruction(user.lang);
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
        perKpN: { type: "integer" },
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
          summaryTasks.push(`${st.type === "debate" ? "Debate" : st.type === "socratic" ? "Socratic" : st.type === "explore" ? "Explore" : st.type === "study" ? "Study" : "Practice"}·${title}${st.n ? "×" + st.n : ""}`);
        } else if (st.type === "review") {
          items.push({ type: "review" }); summaryTasks.push("Redo due mistakes");
        } else if (st.type === "free") {
          const n = st.n != null ? Number(st.n) : 10;
          if (n > 0) { items.push({ type: "free", target: n }); summaryTasks.push(`Free practice ×${n}`); }
        }
      }
    }
    let ft = 10;
    if (!items.length) {
      // 简单重排回退路径
      const kpIds = (out.kpIds || []).map(Number).filter((id) => validIds.has(id)).slice(0, 4);
      if (out.includeReview !== false) { items.push({ type: "review" }); summaryTasks.push("Redo due mistakes"); }
      // 每个知识点的题数:AI 给了用 AI 的;否则若说了可用时间就据此推算(~2.5分钟/题,留点给复习,均分,clamp 2~6);都没有则不设(用默认目标)。
      let perKp = out.perKpN != null ? Math.max(1, Math.min(12, Number(out.perKpN))) : null;
      if (perKp == null && minutes && kpIds.length) {
        const reviewMin = (out.includeReview !== false) ? 12 : 0;
        const qBudget = Math.max(kpIds.length * 2, Math.round((Number(minutes) - reviewMin) / 2.5));
        perKp = Math.max(2, Math.min(6, Math.round(qBudget / kpIds.length)));
      }
      for (const id of kpIds) { const it = { type: "kp", kpId: id, title: titleById.get(id) }; if (perKp != null) it.n = perKp; items.push(it); summaryTasks.push(titleById.get(id) + (perKp != null ? ` ×${perKp}` : "")); }
      ft = out.freeTarget != null ? Number(out.freeTarget) : 10;
      if (ft > 0) { items.push({ type: "free", target: ft }); summaryTasks.push(`Free practice ×${ft}`); }
    }
    if (!items.length) { items.push({ type: "review" }); summaryTasks.push("复习到期错题"); }
    const today = todayStr();
    db.prepare("DELETE FROM daily_plans WHERE exam_id=? AND date=?").run(exam.id, today);
    db.prepare("INSERT INTO daily_plans(exam_id,date,items_json,completed,custom) VALUES(?,?,?,0,1)").run(exam.id, today, JSON.stringify(items));
    return { ok: true, note: out.note || `已按你的需求重排今日任务(共${items.length}步):${summaryTasks.join(" → ")}`, tasks: summaryTasks };
  },
});

// 快路径:纯参数微调(题数/轮数)—— 就地改现有今日任务里的数字,零 AI 调用,不重挑知识点、不重排。
// 用于「自由练习改成5题」「问答改成2题、辩论改成1轮」这类小调参,又快又不误删别的步骤。
registerBrick({
  name: "reorder_daily_plan", category: "planning", write: true,
  title: "只调今日任务的顺序(不动内容/题数,快)",
  description: "【纯顺序微调·零 AI】只把今天今日任务的【先后顺序】改一改(也可以顺带去掉某一项),【不重挑知识点、不改任何题数/轮数、不重新生成】。主人说『先做自由练习再做学新知识』『把复习放最后』『顺序反过来』『内容不变只改顺序』这类要求时【用这个】,别用 customize_daily_plan(那个会整份重排、可能把之前调好的题数一起改掉)。order 里可以写【当前的序号】(1 开头)或【项目关键词】(review=复习到期错题、free=自由练习薄弱点、newkp=学新知识,或直接写标题里的字);没提到的项保持原有相对顺序、排在后面。",
  inputs: [
    { key: "order", type: "array", required: false, desc: "新的先后顺序:元素可以是当前序号(数字,1开头)或关键词(review/free/newkp/标题里的字)。只写要提前的几项也行。" },
    { key: "remove", type: "array", required: false, desc: "要去掉的项(同样用序号或关键词);不传=不删" },
  ],
  run: async (args, ctx) => {
    const user = ctx.user;
    const exam = ctx.exam || getActiveExam(user.id);
    if (!exam) return { ok: false, reason: "no_exam" };
    const { items } = currentDailyItems(user.id, exam);
    const cur = (items || []).map((x) => ({ ...x }));
    if (!cur.length) return { ok: false, note: "今天还没有任务,没什么可排的。" };
    const ALIAS = { "复习": "review", "错题": "review", "自由练习": "free", "薄弱": "free", "学新知识": "newkp", "新知识": "newkp" };
    // 把一个"匹配符"解析成 cur 里的下标;数字=当前序号(1开头),字符串=类型或标题关键词
    const resolve = (m, used) => {
      if (m == null) return -1;
      if (typeof m === "number" || /^\d+$/.test(String(m).trim())) {
        const i = Math.floor(Number(m)) - 1;
        return i >= 0 && i < cur.length && !used.has(i) ? i : -1;
      }
      const raw = String(m).trim();
      const asType = ALIAS[raw] || raw.toLowerCase();
      for (let i = 0; i < cur.length; i++) {
        if (used.has(i)) continue;
        if (cur[i].type === asType) return i;
        if (raw && cur[i].title && String(cur[i].title).includes(raw)) return i;
      }
      return -1;
    };
    // 先处理删除
    const dropped = new Set();
    for (const m of (Array.isArray(args.remove) ? args.remove : [])) { const i = resolve(m, dropped); if (i >= 0) dropped.add(i); }
    // 再按 order 排;没点到的保持原有相对顺序、接在后面
    const used = new Set(dropped);
    const out = [];
    for (const m of (Array.isArray(args.order) ? args.order : [])) { const i = resolve(m, used); if (i >= 0) { used.add(i); out.push(cur[i]); } }
    for (let i = 0; i < cur.length; i++) if (!used.has(i)) out.push(cur[i]);
    if (!out.length) return { ok: false, note: "这样排下来一条任务都不剩了,没有改动。" };
    const changedOrder = out.some((x, i) => x !== cur[i]) || dropped.size > 0;
    if (!changedOrder) return { ok: false, note: "顺序和现在一样(也没有要删的),没有改动。" };
    const today = todayStr();
    db.prepare("DELETE FROM daily_plans WHERE exam_id=? AND date=?").run(exam.id, today);
    db.prepare("INSERT INTO daily_plans(exam_id,date,items_json,completed,custom) VALUES(?,?,?,0,1)").run(exam.id, today, JSON.stringify(out));
    const nameOf = (i) => i.type === "review" ? "复习到期错题" : i.type === "free" ? "自由练习薄弱点" : i.type === "newkp" ? "学新知识" : (i.title || i.type);
    return { ok: true, note: `已只改顺序(内容和题数一个没动)${dropped.size ? `,并去掉了 ${dropped.size} 项` : ""}:新顺序=${out.map((x, i) => `${i + 1}.${nameOf(x)}`).join(" → ")}` };
  },
});

registerBrick({
  name: "tweak_daily_plan", category: "planning", write: true,
  title: "微调今日任务的数字(题数/轮数,快)",
  description: "【纯数字微调】就地修改今天今日任务里的【题数/轮数】,不重挑知识点、不重排、不跑 AI——又快又稳。用于:『自由练习改成5题』『问答改成2题、辩论改成1轮』『把某步的题数改成3』这类【只改数量、别的都不动】的小请求。★这类小调参【优先用本工具】,不要用会重排整份计划的 customize_daily_plan(那个慢、且会重挑知识点);【尤其:哪怕当前有活跃的学习配方/方法,只是改题数/轮数也【绝不要】去重跑 recipe_save——那会重新生成整套配方、又慢又重(动辄几分钟)。纯数字就用本工具改当天;只有主人明确要【永久改变每次的数量】时才动配方,而且要用最小改动、别整套重存。freeCount=把自由练习设成几题(0=去掉自由练习);changes=改某些有序步骤的数量,每项 {match, n}:match 可填步骤类型(practice/debate/socratic/explore)或知识点标题里的关键词,n=新的题数/轮数。",
  inputs: [
    { key: "freeCount", type: "number", required: false, desc: "把自由练习设成几题(0=去掉;不传=不动)" },
    { key: "changes", type: "array", required: false, desc: "有序步骤数量微调:[{match:'practice'|'debate'|'socratic'|'explore'|标题关键词, n:新数量}]" },
  ],
  run: async (args, ctx) => {
    const user = ctx.user;
    const exam = ctx.exam || getActiveExam(user.id);
    if (!exam) return { ok: false, reason: "no_exam" };
    const { items } = currentDailyItems(user.id, exam);
    const out = items.map((x) => ({ ...x }));
    const notes = [];
    // 自由练习题数
    if (args.freeCount != null) {
      const fc = Math.max(0, Math.floor(Number(args.freeCount) || 0));
      const fi = out.find((x) => x.type === "free");
      if (fc <= 0) { const before = out.length; for (let i = out.length - 1; i >= 0; i--) if (out[i].type === "free") out.splice(i, 1); if (out.length < before) notes.push("去掉自由练习"); }
      else if (fi) { fi.target = fc; notes.push(`自由练习→${fc}题`); }
      else { out.push({ type: "free", target: fc }); notes.push(`加自由练习${fc}题`); }
    }
    // 有序步骤数量
    const TYPE_ALIAS = { "问答": "practice", "练习": "practice", "辩论": "debate", "苏格拉底": "socratic", "探索": "explore" };
    for (const ch of (Array.isArray(args.changes) ? args.changes : [])) {
      if (!ch || ch.n == null) continue;
      const n = Math.max(0, Math.floor(Number(ch.n) || 0));
      const raw = String(ch.match || "").trim();
      const asType = TYPE_ALIAS[raw] || raw.toLowerCase();
      let hit = 0;
      for (const it of out) {
        const typeMatch = ["practice", "debate", "socratic", "explore"].includes(asType) && it.type === asType;
        const titleMatch = raw && it.title && String(it.title).includes(raw);
        if (typeMatch || titleMatch) {
          if (it.type === "free") it.target = n; else it.n = n;
          hit++;
        }
      }
      if (hit) notes.push(`${raw}→${n}`);
    }
    if (!notes.length) return { ok: false, note: "没有识别到要改的数字(freeCount 或 changes 至少给一个),没有改动。" };
    const today = todayStr();
    db.prepare("DELETE FROM daily_plans WHERE exam_id=? AND date=?").run(exam.id, today);
    db.prepare("INSERT INTO daily_plans(exam_id,date,items_json,completed,custom) VALUES(?,?,?,0,1)").run(exam.id, today, JSON.stringify(out));
    try {
      const recipeChanges = (Array.isArray(args.changes) ? args.changes : []).filter((c) => c && c.n != null).map((c) => ({ match: c.match, count: Number(c.n) }));
      if (recipeChanges.length) tweakRecipeCounts(user.id, exam.id, recipeChanges);
    } catch {}
    return { ok: true, note: `已微调今日任务(其它步骤不动):${notes.join("、")}`, tasks: out.map((i) => i.type === "kp" ? `Study:${i.title}` : i.type === "review" ? "Redo due mistakes" : i.type === "free" ? `Free practice ×${i.target}` : `${i.type}·${i.title || ""}${i.n ? "×" + i.n : ""}`) };
  },
});
