// 砖头:跨考试功能管理(考试父子关系 + 知识点/题目跨考试匹配与复制)。
// 这些只是「砖头」——把它们组装成「中途小任务」等功能,由开发者 + 内置 AI 完成,不在这里实现。
import db from "@/lib/db";
import { embed, cosine } from "@/lib/gemini";
import { registerBrick } from "@/lib/bricks/registry";

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
  description: "只建一条考试记录(名称/类型/父考试),不联网、不建知识树、不出题。用于先建一个小任务的壳,后续再由其它砖头填充。返回 examId。",
  inputs: [{ key: "name", type: "string", required: true, desc: "考试/任务名称" }, { key: "examType", type: "string", required: false, desc: "类型,如 quiz/assignment/exam/study" }, { key: "parentExamId", type: "number", required: false, desc: "父考试 id(设为它的小任务)" }],
  run: async (args, ctx) => {
    const name = String(args.name || "").trim();
    if (!name) throw new Error("name required");
    let parent = null;
    if (args.parentExamId) { if (!own(ctx.user.id, args.parentExamId)) throw new Error("parent exam not found/owned"); parent = Number(args.parentExamId); }
    // 不抢占焦点:仅当用户当前没有激活考试时,新壳才设为 active;否则设为 archived(在追杀计划里可见、可手动切换),
    // 避免一个空壳顶掉用户正在学的考试(getActiveExam 取最新的 active)。
    const hasActive = db.prepare("SELECT id FROM exams WHERE user_id=? AND status='active' AND deleted_at IS NULL LIMIT 1").get(ctx.user.id);
    const status = hasActive ? "archived" : "active";
    const info = db.prepare("INSERT INTO exams(name,user_id,status,exam_type,parent_exam_id,assess_status) VALUES(?,?,?,?,?,'done')").run(name, ctx.user.id, status, args.examType || null, parent);
    return { examId: info.lastInsertRowid, status };
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
    const kpMap = args.kpMap || {};
    const srcKpIds = Object.keys(kpMap).map(Number).filter(Boolean);
    if (!srcKpIds.length) throw new Error("kpMap is empty");
    const insQ = db.prepare("INSERT INTO questions(exam_id,kp_id,qtype,body,answer,difficulty,source_type,source_refs,origin,answer_origin,source_url,is_real,fixed_key,must_include) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
    const insA = db.prepare("INSERT INTO attempts(question_id,exam_id,kp_id,user_answer,correct,score,feedback,mode,created_at) VALUES(?,?,?,?,?,?,?,?,?)");
    let copiedQ = 0, copiedA = 0;
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
          }
        }
      }
    });
    tx();
    return { copiedQuestions: copiedQ, copiedAttempts: copiedA };
  },
});
