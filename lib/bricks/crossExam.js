// 砖头:跨考试功能管理(考试父子关系 + 知识点/题目跨考试匹配与复制)。
// 这些只是「砖头」——把它们组装成「中途小任务」等功能,由开发者 + 内置 AI 完成,不在这里实现。
import db, { examNameExists } from "@/lib/db";
import { embed, cosine } from "@/lib/gemini";
import { registerBrick } from "@/lib/bricks/registry";
import { snapshot } from "@/lib/checkpoint";
import { recomputeReviewFromAttempts } from "@/lib/mastery";
import { setLangBackground } from "@/lib/langTransfer";

function own(userId, examId) {
  const e = db.prepare("SELECT * FROM exams WHERE id=? AND user_id=? AND deleted_at IS NULL").get(Number(examId), userId);
  return e || null;
}
const points = (examId) => db.prepare("SELECT id, title, parent_id, coverage FROM knowledge_points WHERE exam_id=? AND parent_id IS NOT NULL").all(Number(examId));
const chapterTitle = (id) => (id ? db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(id)?.title || "" : "");

// 1) 列出用户的所有考试(含统计与父子关系)
registerBrick({
  name: "exam_list", category: "cross_exam", title: "列出所有考试(含进度与父子关系)", write: false,
  description: "返回当前用户的全部考试:id、名称、类型、日期、状态、父考试 id、知识点数、做题数与正确数。用来在跨考试操作前了解全貌。",
  inputs: [],
  run: async (args, ctx) => {
    const rows = db.prepare("SELECT id,name,exam_type,exam_date,status,parent_exam_id,closed_bank FROM exams WHERE user_id=? AND deleted_at IS NULL ORDER BY id DESC").all(ctx.user.id);
    return rows.map((e) => {
      const kp = db.prepare("SELECT COUNT(*) n FROM knowledge_points WHERE exam_id=? AND parent_id IS NOT NULL").get(e.id).n;
      const at = db.prepare("SELECT COUNT(*) n, SUM(correct) c FROM attempts WHERE exam_id=?").get(e.id);
      const children = db.prepare("SELECT id,name FROM exams WHERE parent_exam_id=? AND deleted_at IS NULL").all(e.id);
      return { id: e.id, name: e.name, examType: e.exam_type || null, examDate: e.exam_date || null, status: e.status, parentExamId: e.parent_exam_id || null, closedBank: !!e.closed_bank, kpCount: kp, attempts: at.n || 0, correct: at.c || 0, children };
    });
  },
});

// 2) 创建一个空白考试壳(不跑 AI 搜集/建树),可指定父考试
registerBrick({
  name: "exam_create", category: "cross_exam", title: "创建空白考试壳(不跑 AI)", write: true,
  description: "只建一条考试记录(名称/类型/父考试),不联网、不建知识树、不出题。用于先建一个小任务的壳,后续再由其它砖头填充。返回 examId。【建语言类考试(examType=language)时,务必顺便收集用户的语言背景】:母语、已经会的外语(可多门:二外/三外/四外)、正在学的目标语,通过 langNative/langKnown/langTarget 传入,用于三语迁移追踪;用户没说就问一句。",
  inputs: [{ key: "name", type: "string", required: true, desc: "考试/任务名称" }, { key: "examType", type: "string", required: false, desc: "类型,如 quiz/assignment/exam/study/language" }, { key: "parentExamId", type: "number", required: false, desc: "父考试 id(设为它的小任务)" }, { key: "langNative", type: "string", required: false, desc: "母语(语言类考试)" }, { key: "langKnown", type: "string", required: false, desc: "已会外语,逗号分隔,可多门" }, { key: "langTarget", type: "string", required: false, desc: "正在学的目标语" }],
  run: async (args, ctx) => {
    const name = String(args.name || "").trim();
    if (!name) throw new Error("name required");
    let parent = null;
    if (args.parentExamId) { if (!own(ctx.user.id, args.parentExamId)) throw new Error("parent exam not found/owned"); parent = Number(args.parentExamId); }
    // 不抢占焦点:仅当用户当前没有激活考试时,新壳才设为 active;否则设为 archived(在追杀计划里可见、可手动切换),
    // 避免一个空壳顶掉用户正在学的考试(getActiveExam 取最新的 active)。
    const hasActive = db.prepare("SELECT id FROM exams WHERE user_id=? AND status='active' AND deleted_at IS NULL LIMIT 1").get(ctx.user.id);
    const status = hasActive ? "archived" : "active";
    if (examNameExists(ctx.user.id, name, { parentExamId: parent })) throw new Error(`已经有一门同名的考试「${name}」了${parent ? "(同一母考试下)" : ""}——换个名字,或直接用已有的那门,别重复建。`);
    const info = db.prepare("INSERT INTO exams(name,user_id,status,exam_type,parent_exam_id,assess_status) VALUES(?,?,?,?,?,'done')").run(name, ctx.user.id, status, args.examType || null, parent);
    let langBg = null;
    if (args.langNative || args.langKnown || args.langTarget) {
      const known = args.langKnown ? String(args.langKnown).split(/[,，、]/).map((x) => x.trim()).filter(Boolean) : [];
      try { langBg = setLangBackground(ctx.user.id, { native: args.langNative || "", known, target: args.langTarget || "" }); } catch {}
    }
    return { examId: info.lastInsertRowid, status, langBackground: langBg };
  },
});

// 3) 把 A 设为 B 的小任务(A.parent = B)
registerBrick({
  name: "exam_set_parent", category: "cross_exam", title: "把某考试设为另一考试的小任务", write: true,
  description: "设置 examId 的父考试为 parentExamId(examId 成为 parentExamId 的小任务)。两者都必须属于当前用户;不会移动或删除任何数据,只建立关系。会阻止形成环。",
  inputs: [{ key: "examId", type: "number", required: true, desc: "要成为小任务的考试 id" }, { key: "parentExamId", type: "number", required: true, desc: "父考试 id" }],
  run: async (args, ctx) => {
    const a = own(ctx.user.id, args.examId), b = own(ctx.user.id, args.parentExamId);
    if (!a || !b) throw new Error("exam not found/owned");
    if (a.id === b.id) throw new Error("cannot be its own parent");
    // 防环:沿 b 的祖先链上溯,不能遇到 a
    let cur = b, guard = 0;
    while (cur && cur.parent_exam_id && guard++ < 50) {
      if (cur.parent_exam_id === a.id) throw new Error("would create a cycle");
      cur = db.prepare("SELECT id,parent_exam_id FROM exams WHERE id=?").get(cur.parent_exam_id);
    }
    try { snapshot(ctx.user.id, [a.id], { op: "set_parent", label: `把「${a.name}」挂到「${b.name}」下` }); } catch {}
    db.prepare("UPDATE exams SET parent_exam_id=? WHERE id=?").run(b.id, a.id);
    return { ok: true, examId: a.id, parentExamId: b.id };
  },
});

// 4) 解除小任务关系
registerBrick({
  name: "exam_unset_parent", category: "cross_exam", title: "从某个父考试下解除一个小任务", write: true,
  description: "只解除 parentExamId 下面的某一个子考试 childExamId(把 childExamId 的父考试清空)。会先校验 childExamId 当前确实挂在 parentExamId 下,不匹配就报错;绝不会批量解除某个父考试下的所有子任务。数据保留不动。",
  inputs: [{ key: "parentExamId", type: "number", required: true, desc: "父考试 id" }, { key: "childExamId", type: "number", required: true, desc: "要解除的那个子考试 id" }],
  run: async (args, ctx) => {
    const child = own(ctx.user.id, args.childExamId);
    const parent = own(ctx.user.id, args.parentExamId);
    if (!child || !parent) throw new Error("exam not found/owned");
    if (Number(child.parent_exam_id) !== Number(parent.id)) throw new Error("childExamId 当前并不挂在 parentExamId 下,拒绝解除");
    try { snapshot(ctx.user.id, [child.id], { op: "unset_parent", label: `从「${parent.name}」下解除「${child.name}」` }); } catch {}
    db.prepare("UPDATE exams SET parent_exam_id=NULL WHERE id=?").run(child.id);
    return { ok: true, childExamId: child.id, parentExamId: parent.id };
  },
});

// 5) 跨考试匹配知识点(向量相似度)
registerBrick({
  name: "exam_match_kps", category: "cross_exam", title: "跨考试匹配知识点", write: false,
  description: "把 fromExamId 的知识点与 toExamId 的知识点做语义相似度匹配。返回 matched(from→to 对应,含相似度)与 unmatched(from 里没有对应项的,含最接近项)。用于判断一个新任务的内容有多少能落到已有知识点上、有多少要新建。",
  inputs: [{ key: "fromExamId", type: "number", required: true, desc: "来源考试 id" }, { key: "toExamId", type: "number", required: true, desc: "目标考试 id" }, { key: "threshold", type: "number", required: false, desc: "判为匹配的相似度阈值,默认 0.82" }],
  run: async (args, ctx) => {
    if (!own(ctx.user.id, args.fromExamId) || !own(ctx.user.id, args.toExamId)) throw new Error("exam not found/owned");
    const thr = typeof args.threshold === "number" ? args.threshold : 0.82;
    const fromPts = points(args.fromExamId).slice(0, 300), toPts = points(args.toExamId).slice(0, 300);
    if (!fromPts.length) return { matched: [], unmatched: [], note: "from exam has no knowledge points" };
    if (!toPts.length) return { matched: [], unmatched: fromPts.map((p) => ({ fromId: p.id, fromTitle: p.title, bestToTitle: null, bestScore: 0 })), note: "to exam has no knowledge points" };
    const label = (p, exId) => `${chapterTitle(p.parent_id)} / ${p.title}`;
    const fVecs = await embed(fromPts.map((p) => label(p)));
    const tVecs = await embed(toPts.map((p) => label(p)));
    const matched = [], unmatched = [];
    fromPts.forEach((fp, i) => {
      let best = -1, bj = -1;
      tVecs.forEach((tv, j) => { const s = cosine(fVecs[i], tv); if (s > best) { best = s; bj = j; } });
      const rec = { fromId: fp.id, fromTitle: fp.title, toId: toPts[bj]?.id, toTitle: toPts[bj]?.title, score: Math.round(best * 1000) / 1000 };
      if (best >= thr) matched.push(rec);
      else unmatched.push({ fromId: fp.id, fromTitle: fp.title, bestToTitle: toPts[bj]?.title || null, bestScore: Math.round(best * 1000) / 1000 });
    });
    return { matched, unmatched };
  },
});

// 6) 跨考试复制知识点(把来源的点复制进目标考试,返回 id 映射)
registerBrick({
  name: "exam_copy_kps", category: "cross_exam", title: "跨考试复制知识点", write: true,
  description: "把 fromExamId 的若干知识点复制进 toExamId(新建点,保留章节归属;目标里没有的章节会自动建)。kpIds 省略=复制全部点。underChapter 可把它们统一归到目标里某个章节名下。返回 idMap(来源点id→新点id)。【重要】这只复制知识点本身,不含题库里已备好的题。凡是帮用户在考试之间迁移知识点,调用方(杀手)必须明确询问用户:是否要把这些知识点在题库里已经备好的题也一起迁移过去?——因为普通用户并不知道「题库」这个机制的存在。若用户同意,再用返回的 idMap 调 exam_copy_questions。",
  inputs: [{ key: "fromExamId", type: "number", required: true, desc: "来源考试 id" }, { key: "toExamId", type: "number", required: true, desc: "目标考试 id" }, { key: "kpIds", type: "json", required: false, desc: "要复制的来源知识点 id 数组;省略=全部点" }, { key: "underChapter", type: "string", required: false, desc: "统一归到目标里这个章节名下(可选)" }],
  run: async (args, ctx) => {
    if (!own(ctx.user.id, args.fromExamId) || !own(ctx.user.id, args.toExamId)) throw new Error("exam not found/owned");
    const to = Number(args.toExamId);
    try { snapshot(ctx.user.id, [to], { op: "copy_kps", label: "跨考试复制知识点(进目标)" }); } catch {}
    let src = points(args.fromExamId);
    if (Array.isArray(args.kpIds) && args.kpIds.length) { const set = new Set(args.kpIds.map(Number)); src = src.filter((p) => set.has(p.id)); }
    const ensureChapter = (title) => {
      const t = title || "补充";
      let ch = db.prepare("SELECT id FROM knowledge_points WHERE exam_id=? AND parent_id IS NULL AND title=?").get(to, t);
      if (!ch) { const info = db.prepare("INSERT INTO knowledge_points(exam_id,parent_id,title,coverage) VALUES(?,?,?,?)").run(to, null, t, "none"); return info.lastInsertRowid; }
      return ch.id;
    };
    const idMap = {}; let created = 0;
    for (const p of src) {
      const chTitle = args.underChapter || chapterTitle(p.parent_id) || "补充";
      const chId = ensureChapter(chTitle);
      const info = db.prepare("INSERT INTO knowledge_points(exam_id,parent_id,title,coverage) VALUES(?,?,?,?)").run(to, chId, p.title, p.coverage || "none");
      idMap[p.id] = info.lastInsertRowid; created++;
    }
    return { idMap, created };
  },
});

// 7) 跨考试复制题目(按知识点 id 映射,可选连作答记录一起复制)
registerBrick({
  name: "exam_copy_questions", category: "cross_exam", title: "跨考试复制题目(可含作答记录)", write: true,
  description: "按 kpMap(来源知识点id→目标知识点id)把来源考试题库里已备好的题复制进目标考试(重挂 exam_id/kp_id)。withAttempts=true 时把这些题的作答记录(练习历史/掌握度依据)也复制过去,从而「保留进度」。返回复制的题数与作答数。【重要】调用前必须已向用户确认过「要连题库里已有的题一起迁移」——用户通常不知道题库的存在,不要默默替他决定。",
  inputs: [{ key: "fromExamId", type: "number", required: true, desc: "来源考试 id" }, { key: "toExamId", type: "number", required: true, desc: "目标考试 id" }, { key: "kpMap", type: "json", required: true, desc: "对象:来源知识点id→目标知识点id" }, { key: "withAttempts", type: "boolean", required: false, desc: "是否连作答记录一起复制(默认否)" }],
  run: async (args, ctx) => {
    if (!own(ctx.user.id, args.fromExamId) || !own(ctx.user.id, args.toExamId)) throw new Error("exam not found/owned");
    const to = Number(args.toExamId);
    try { snapshot(ctx.user.id, [to], { op: "copy_questions", label: "跨考试复制题目(进目标)" }); } catch {}
    const kpMap = args.kpMap || {};
    const srcKpIds = Object.keys(kpMap).map(Number).filter(Boolean);
    if (!srcKpIds.length) throw new Error("kpMap is empty");
    const insQ = db.prepare("INSERT INTO questions(exam_id,kp_id,qtype,body,answer,difficulty,source_type,source_refs,origin,answer_origin,source_url,is_real,fixed_key,must_include) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    const insA = db.prepare("INSERT INTO attempts(question_id,exam_id,kp_id,user_answer,correct,score,feedback,mode,created_at) VALUES(?,?,?,?,?,?,?,?,?)");
    let copiedQ = 0, copiedA = 0; const withAttQ = [];
    const tx = db.transaction(() => {
      for (const srcKp of srcKpIds) {
        const dstKp = Number(kpMap[srcKp]);
        const qs = db.prepare("SELECT * FROM questions WHERE exam_id=? AND kp_id=?").all(Number(args.fromExamId), srcKp);
        for (const q of qs) {
          const ni = insQ.run(to, dstKp, q.qtype, q.body, q.answer, q.difficulty || 2, q.source_type || "model", q.source_refs || "[]", q.origin || "generated", q.answer_origin || "ai", q.source_url || null, q.is_real || 0, null, 0);
          copiedQ++;
          if (args.withAttempts) {
            const ats = db.prepare("SELECT * FROM attempts WHERE question_id=?").all(q.id);
            for (const a of ats) { insA.run(ni.lastInsertRowid, to, dstKp, a.user_answer || "", a.correct || 0, a.score || 0, a.feedback || "", a.mode || "practice", a.created_at || null); copiedA++; }
            if (ats.length) withAttQ.push(ni.lastInsertRowid);
          }
        }
      }
    });
    tx();
    // 合并作答后按时间线重算遗忘曲线(独立解决时间轴冲突)
    for (const qid of withAttQ) { try { recomputeReviewFromAttempts(qid); } catch {} }
    return { copiedQuestions: copiedQ, copiedAttempts: copiedA, reviewRecomputed: withAttQ.length };
  },
});

// 8) 开/关某母考试的“汇总复习”:开启后,母考试的学习/练习/模拟/错题本会实时覆盖它自己 + 全部子考试(不复制数据)。
registerBrick({
  name: "exam_set_aggregate", category: "cross_exam", title: "开关母考试的汇总复习", write: true,
  description: "设置 examId 的“汇总复习”开关(aggregate_children)。on=true 时,这门考试变成母考试:它的学习/练习/模拟考/错题本/掌握度会实时把自己和它下面【全部子考试(整棵子树)】的知识点与题库合并起来复习——不复制、不搬运,加了新小测并挂到它下面就自动并入,取消挂载就自动移出。on=false 关闭,只看它自己。用于把“期末/这门课”设成汇总复习的母考试。",
  inputs: [{ key: "examId", type: "number", required: true, desc: "要设为(或取消)汇总母考试的考试 id" }, { key: "on", type: "boolean", required: true, desc: "true=开启汇总复习;false=关闭" }],
  run: async (args, ctx) => {
    const a = own(ctx.user.id, args.examId);
    if (!a) throw new Error("exam not found/owned");
    try { snapshot(ctx.user.id, [a.id], { op: "set_aggregate", label: `${args.on ? "开启" : "关闭"}「${a.name}」的汇总复习` }); } catch {}
    db.prepare("UPDATE exams SET aggregate_children=? WHERE id=?").run(args.on ? 1 : 0, a.id);
    const kids = db.prepare("SELECT COUNT(*) n FROM exams WHERE parent_exam_id=? AND deleted_at IS NULL").get(a.id).n;
    return { ok: true, examId: a.id, aggregate: !!args.on, directChildren: kids };
  },
});

// 9) 读取一棵考试子树(递归),每个节点带知识点数/题量/做题数,便于杀手看清结构、向主人汇报。
registerBrick({
  name: "exam_tree", category: "cross_exam", title: "读取考试子树(递归含统计)", write: false,
  description: "以 examId 为根,递归返回整棵子树(它自己 + 所有层级的子考试)。每个节点含 id、name、depth、parentExamId、aggregate(是否已开汇总复习)、kpCount(叶子知识点数)、bankCount(题库题数)、attempts(做题数)、correct(答对数)。用于在设置/汇总前看清一门课下面挂了哪些期中/小测、各自进度如何。",
  inputs: [{ key: "examId", type: "number", required: true, desc: "作为根的考试 id" }],
  run: async (args, ctx) => {
    const root = own(ctx.user.id, args.examId);
    if (!root) throw new Error("exam not found/owned");
    const node = (e, depth) => {
      const kp = db.prepare("SELECT COUNT(*) n FROM knowledge_points WHERE exam_id=? AND parent_id IS NOT NULL").get(e.id).n;
      const bank = db.prepare("SELECT COUNT(*) n FROM questions WHERE exam_id=? AND flagged=0").get(e.id).n;
      const at = db.prepare("SELECT COUNT(*) n, SUM(correct) c FROM attempts WHERE exam_id=?").get(e.id);
      return { id: e.id, name: e.name, depth, parentExamId: e.parent_exam_id || null, aggregate: !!e.aggregate_children, kpCount: kp, bankCount: bank, attempts: at.n || 0, correct: at.c || 0 };
    };
    const out = []; const seen = new Set([root.id]);
    const walk = (e, depth) => {
      out.push(node(e, depth));
      if (depth > 20) return;
      const kids = db.prepare("SELECT * FROM exams WHERE parent_exam_id=? AND deleted_at IS NULL ORDER BY id").all(e.id);
      for (const k of kids) { if (!seen.has(k.id)) { seen.add(k.id); walk(k, depth + 1); } }
    };
    walk(root, 0);
    return { rootId: root.id, nodes: out, total: out.length };
  },
});

// 10) 提拔薄弱/错题:把来源考试里“薄弱或做错”的知识点及其题目复制进目标考试,拢成一个考前精选冲刺集。
registerBrick({
  name: "exam_promote_weak", category: "cross_exam", title: "把薄弱/错题提拔进精选集", write: true,
  description: "从 fromExamId 里挑出用户【薄弱(掌握度 weak)或最近做错】的叶子知识点,把这些知识点及其题目复制进 toExamId(新建点/题,保留章节归属)。levels 可指定要提拔哪些掌握度等级(默认 ['weak'])。用于考前把各科/各小测的薄弱点拢进一个“期末冲刺精选集”。返回提拔的知识点数与题目数。注意:这是【复制】,和实时汇总(exam_set_aggregate)不同——精选集是一份定格的快照,之后来源更新不会自动同步。",
  inputs: [{ key: "fromExamId", type: "number", required: true, desc: "来源考试 id" }, { key: "toExamId", type: "number", required: true, desc: "目标(精选集)考试 id" }, { key: "levels", type: "json", required: false, desc: "要提拔的掌握度等级数组,默认 ['weak'];可含 'unlearned'/'ok'" }, { key: "underChapter", type: "string", required: false, desc: "统一归到目标里这个章节名下(可选)" }],
  run: async (args, ctx) => {
    const from = own(ctx.user.id, args.fromExamId), to = own(ctx.user.id, args.toExamId);
    if (!from || !to) throw new Error("exam not found/owned");
    try { snapshot(ctx.user.id, [to.id], { op: "promote_weak", label: `把「${from.name}」的薄弱/错题提拔进「${to.name}」` }); } catch {}
    const { masteryMatrix } = await import("@/lib/mastery");
    const levels = Array.isArray(args.levels) && args.levels.length ? args.levels : ["weak"];
    const matrix = masteryMatrix(from.id);         // 注意:若 from 开了汇总,这里已是整棵子树
    const weakKps = matrix.filter((k) => levels.includes(k.level));
    if (!weakKps.length) return { promotedKps: 0, promotedQuestions: 0, note: "来源里没有符合条件的薄弱知识点" };
    const ensureChapter = (title) => {
      const t = title || "冲刺精选";
      let ch = db.prepare("SELECT id FROM knowledge_points WHERE exam_id=? AND parent_id IS NULL AND title=?").get(to.id, t);
      if (!ch) { const info = db.prepare("INSERT INTO knowledge_points(exam_id,parent_id,title,coverage) VALUES(?,?,?,?)").run(to.id, null, t, "none"); return info.lastInsertRowid; }
      return ch.id;
    };
    const insQ = db.prepare("INSERT INTO questions(exam_id,kp_id,qtype,body,answer,difficulty,source_type,source_refs,origin,answer_origin,source_url,is_real,fixed_key,must_include) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    let pk = 0, pq = 0;
    const tx = db.transaction(() => {
      for (const kp of weakKps) {
        const chId = ensureChapter(args.underChapter || kp.chapter || "冲刺精选");
        const info = db.prepare("INSERT INTO knowledge_points(exam_id,parent_id,title,coverage) VALUES(?,?,?,?)").run(to.id, chId, kp.title, "none");
        const newKp = info.lastInsertRowid; pk++;
        const qs = db.prepare("SELECT * FROM questions WHERE kp_id=? AND flagged=0").all(kp.id);
        for (const q of qs) { insQ.run(to.id, newKp, q.qtype, q.body, q.answer, q.difficulty || 2, q.source_type || "model", q.source_refs || "[]", q.origin || "generated", q.answer_origin || "ai", q.source_url || null, q.is_real || 0, null, 0); pq++; }
      }
    });
    tx();
    return { promotedKps: pk, promotedQuestions: pq, levels };
  },
});

// 11) 一次性开好一门【有内容】的考试:建考试→(子任务)挂父 /(母考试)把旧考试挂进来并开汇总或带内容→后台生成知识点树+蓝图(+时间预算复习计划)。立即返回,不阻塞。
registerBrick({
  name: "exam_provision", category: "cross_exam", title: "开一门有内容的考试(后台生成)", write: true,
  description: "创建一门考试并【后台】生成内容(知识点树+蓝图,可选时间预算复习计划),立即返回 examId,不阻塞——生成期间在追杀计划里显示⏳生成中、可续。role 决定形态:standalone=独立考试;child=某母考试下的小任务(必须给 parentExamId;子任务不会照搬母考试全部信息,要靠 notes/emphasis/durationMin 说清本次侧重与时长);mother=在若干已有考试之上新建的母考试(给 childExamIds 把它们挂进来)。母考试如何处理旧内容由 carryMode 决定:live=不搬运,实时汇总整棵子树(默认,最省);summarize=把知识点和掌握情况总结后搬过去(掌握情况以“观察”形式带过,carryWithQuestions=true 时连题一起搬);partial=只把有价值的题搬过去(仅从错题和没做过的题里挑);copy_all=直接复制全部知识点和题。webSearch=是否为这门考试单独联网搜考试信息(题型/分值/大纲);子任务通常 false(沿用母考试)。timeBudgetMin=用户想用多少分钟复习完(给了就生成一份该时长的紧凑复习计划,如“一小时复习全部”)。",
  inputs: [
    { key: "name", type: "string", required: true, desc: "考试/任务名称" },
    { key: "role", type: "string", required: false, desc: "standalone / child / mother(默认 standalone)" },
    { key: "parentExamId", type: "number", required: false, desc: "role=child 时:挂到哪个母考试下" },
    { key: "childExamIds", type: "json", required: false, desc: "role=mother 时:要挂到这个新母考试下的已有考试 id 数组" },
    { key: "examType", type: "string", required: false, desc: "类型,如 quiz/assignment/exam/study/performance" },
    { key: "examDate", type: "string", required: false, desc: "考试日期 YYYY-MM-DD(可选)" },
    { key: "webSearch", type: "boolean", required: false, desc: "是否单独联网搜这门考试的信息(子任务通常否)" },
    { key: "notes", type: "string", required: false, desc: "本次考试的补充说明(内容范围、要求等)" },
    { key: "emphasis", type: "string", required: false, desc: "本次侧重(小测可能和期末侧重不同)" },
    { key: "durationMin", type: "number", required: false, desc: "这门考试本身的时长(分钟)" },
    { key: "timeBudgetMin", type: "number", required: false, desc: "用户想用多少分钟复习完全部内容(给了就生成对应时长的复习计划)" },
    { key: "carryMode", type: "string", required: false, desc: "role=mother 时:live / summarize / partial / copy_all(默认 live)" },
    { key: "carryWithQuestions", type: "boolean", required: false, desc: "carryMode=summarize 时:是否连题目也搬过去" },
    { key: "carryFromExamIds", type: "json", required: false, desc: "从哪些考试搬内容(省略=childExamIds)" },
  ],
  run: async (args, ctx) => {
    const name = String(args.name || "").trim();
    if (!name) throw new Error("name required");
    const role = ["standalone", "child", "mother"].includes(args.role) ? args.role : "standalone";
    let parent = null;
    if (role === "child") {
      if (!args.parentExamId || !own(ctx.user.id, args.parentExamId)) throw new Error("child 角色必须给有效的 parentExamId");
      parent = Number(args.parentExamId);
    }
    // 不抢占当前激活考试
    const hasActive = db.prepare("SELECT id FROM exams WHERE user_id=? AND status='active' AND deleted_at IS NULL LIMIT 1").get(ctx.user.id);
    const status = hasActive ? "archived" : "active";
    if (examNameExists(ctx.user.id, name, { parentExamId: parent })) throw new Error(`已经有一门同名的考试「${name}」了${parent ? "(同一母考试下)" : ""}——换个名字,或直接用已有的那门,别重复建。`);
    const info = db.prepare("INSERT INTO exams(name,user_id,status,exam_type,parent_exam_id,exam_date,assess_status,setup_state) VALUES(?,?,?,?,?,?,'pending','draft')")
      .run(name, ctx.user.id, status, args.examType || null, parent, args.examDate || null);
    const examId = info.lastInsertRowid;
    const exam = db.prepare("SELECT * FROM exams WHERE id=?").get(examId);

    const carryMode = ["live", "summarize", "partial", "copy_all"].includes(args.carryMode) ? args.carryMode : "live";
    let childIds = [];
    if (role === "mother") {
      childIds = (Array.isArray(args.childExamIds) ? args.childExamIds : []).map(Number).filter((id) => own(ctx.user.id, id));
      if (childIds.length) { try { snapshot(ctx.user.id, childIds, { op: "provision_attach", label: `把 ${childIds.length} 门考试挂到新母考试「${name}」下` }); } catch {} }
      for (const cid of childIds) db.prepare("UPDATE exams SET parent_exam_id=? WHERE id=?").run(examId, cid);
      // live=开实时汇总(不复制);其它 carryMode 会把内容复制进来,故关闭汇总避免重复。
      db.prepare("UPDATE exams SET aggregate_children=? WHERE id=?").run(carryMode === "live" ? 1 : 0, examId);
    }

    const opts = {
      role,
      webSearch: !!args.webSearch,
      notes: args.notes || "",
      emphasis: args.emphasis || "",
      durationMin: args.durationMin ? Number(args.durationMin) : null,
      timeBudgetMin: args.timeBudgetMin ? Number(args.timeBudgetMin) : null,
      inheritFromExamId: role === "child" ? parent : null,
      carry: role === "mother" ? { mode: carryMode, withQuestions: !!args.carryWithQuestions, fromExamIds: (Array.isArray(args.carryFromExamIds) && args.carryFromExamIds.length ? args.carryFromExamIds.map(Number) : childIds) } : null,
    };
    const { startProvision } = await import("@/lib/provision");
    const r = startProvision(exam, ctx.user, opts);
    return { examId, role, status, setupState: "generating", aggregate: role === "mother" ? (carryMode === "live") : false, carryMode: role === "mother" ? carryMode : null, childrenAttached: childIds.length, note: "内容正在后台生成,可用 exam_gen_status 查进度" };
  },
});

// 12) 查一门考试的生成进度(是否已就绪),供杀手决定能不能接着做依赖内容的步骤(复制/匹配),并向主人汇报。
registerBrick({
  name: "exam_gen_status", category: "cross_exam", title: "查考试生成进度/是否就绪", write: false,
  description: "返回 examId 的生成状态:phase(generating=生成中 / draft=草稿未开始 / error=生成失败 / ready=已就绪)、kpCount(知识点数)、bankCount(题库题数)。杀手在做需要新考试内容的步骤(exam_copy_kps / exam_match_kps / exam_promote_weak)前,应先用它确认 ready;能实时汇总的操作(挂父+开汇总)不必等。",
  inputs: [{ key: "examId", type: "number", required: true, desc: "考试 id" }],
  run: async (args, ctx) => {
    const e = own(ctx.user.id, args.examId);
    if (!e) throw new Error("exam not found/owned");
    const ss = e.setup_state || null;
    const phase = ss === "generating" ? "generating" : ss === "error" ? "error" : ss === "draft" ? "draft" : "ready";
    const kp = db.prepare("SELECT COUNT(*) n FROM knowledge_points WHERE exam_id=? AND parent_id IS NOT NULL").get(e.id).n;
    const bank = db.prepare("SELECT COUNT(*) n FROM questions WHERE exam_id=? AND flagged=0").get(e.id).n;
    return { examId: e.id, name: e.name, phase, ready: phase === "ready", kpCount: kp, bankCount: bank };
  },
});

