// 砖头(类19):多考试【合并 / 拆分】—— 与「复制」不同,这里是【移动】数据并保持引用完整性。
// - exam_merge:把一门考试整个并入另一门(移动知识点/题目/作答/讲解/资料…,按章节+标题去重,软删来源)。
// - exam_split:把一门考试里的若干知识点拆到一门新的/已有的考试里(连题目与作答一起搬走)。
// - exam_integrity_check:体检——找出并可选修复孤儿引用、exam/kp 归属不一致、复习队列孤儿、父子环。
// 全程包在事务里:任何一步抛错都整体回滚,不会留下半迁移的脏数据。
import db from "@/lib/db";
import { registerBrick } from "@/lib/bricks/registry";
import { snapshot } from "@/lib/checkpoint";
import { recomputeReviewFromAttempts, invalidateKnowledgeState } from "@/lib/mastery";

function own(userId, examId) {
  return db.prepare("SELECT * FROM exams WHERE id=? AND user_id=? AND deleted_at IS NULL").get(Number(examId), userId) || null;
}
// 顺着 parent_exam_id 收集某考试的整棵子树 id 集合(用于判断「是否祖先/后代」,防环)。
function subtreeIds(rootId) {
  const ids = new Set([Number(rootId)]);
  let frontier = [Number(rootId)], guard = 0;
  while (frontier.length && guard++ < 500) {
    const next = [];
    for (const pid of frontier) {
      const kids = db.prepare("SELECT id FROM exams WHERE parent_exam_id=? AND deleted_at IS NULL").all(pid);
      for (const k of kids) if (!ids.has(k.id)) { ids.add(k.id); next.push(k.id); }
    }
    frontier = next;
  }
  return ids;
}
// target 挂到 newParent 下会不会成环:newParent 不能是 target 自己、也不能在 target 的子树里。
function wouldCycle(targetId, newParentId) {
  if (!newParentId) return false;
  if (Number(targetId) === Number(newParentId)) return true;
  return subtreeIds(targetId).has(Number(newParentId));
}
const chTitle = (id) => (id ? db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(id)?.title || "" : "");
// 移动 exam_id 的普通表(无唯一约束冲突风险)。
const PLAIN_EXAM_TABLES = ["browser_jobs", "bug_reports", "chat_files", "chat_messages", "chat_pending", "chat_runs", "chunks", "feedback", "gen_lessons", "materials", "memory_facts", "mock_exams", "notes"];

// ───────────────────────────── exam_merge ─────────────────────────────
registerBrick({
  name: "exam_merge", category: "cross_exam", title: "合并:把一门考试整个并入另一门(移动,非复制)", write: true,
  description: "把 sourceExamId 【整体并入】 targetExamId:移动它的知识点、题目、作答记录(掌握度随之迁移)、讲解、资料、错题、笔记等,然后把 sourceExamId 软删除。知识点按【章节名+知识点标题】去重——目标已有的同名点会把来源的题/作答/讲解并到那个已有点上(kp_id 重映射);目标没有的点整点搬过去(保留 id)。来源的子考试会改挂到 target 下(自动防环)。全程事务化、保持引用完整性。dedupeKps 省略=默认去重。【破坏性】调用前必须向用户明确确认:这会移动数据并删除来源考试。",
  inputs: [
    { key: "sourceExamId", type: "number", required: true, desc: "被并入(将被软删)的来源考试 id" },
    { key: "targetExamId", type: "number", required: true, desc: "并入到的目标考试 id(保留)" },
    { key: "dedupeKps", type: "boolean", required: false, desc: "同章节同标题的知识点是否合并到目标已有点上(默认 true)" },
  ],
  run: async (args, ctx) => {
    const src = own(ctx.user.id, args.sourceExamId), dst = own(ctx.user.id, args.targetExamId);
    if (!src || !dst) throw new Error("exam not found/owned");
    if (src.id === dst.id) throw new Error("不能把一门考试并入它自己");
    const dedupe = args.dedupeKps !== false;
    try { snapshot(ctx.user.id, [src.id, dst.id], { op: "exam_merge", label: `合并「${src.name}」→「${dst.name}」` }); } catch {}

    const stats = { movedKps: 0, dedupedKps: 0, movedQuestions: 0, movedAttempts: 0, remappedRefs: 0, reparentedChildren: 0 };
    const withAttQ = [];

    const tx = db.transaction(() => {
      // 目标章节 find-or-create(按标题)。
      const dstChapterId = (title) => {
        const t = (title || "补充").trim() || "补充";
        const ch = db.prepare("SELECT id FROM knowledge_points WHERE exam_id=? AND parent_id IS NULL AND title=?").get(dst.id, t);
        if (ch) return ch.id;
        return db.prepare("INSERT INTO knowledge_points(exam_id,parent_id,title,coverage) VALUES(?,?,?,?)").run(dst.id, null, t, "none").lastInsertRowid;
      };
      const leaves = db.prepare("SELECT id,title,parent_id,coverage FROM knowledge_points WHERE exam_id=? AND parent_id IS NOT NULL").all(src.id);
      for (const lf of leaves) {
        const dstCh = dstChapterId(chTitle(lf.parent_id));
        const dup = dedupe ? db.prepare("SELECT id FROM knowledge_points WHERE exam_id=? AND parent_id=? AND title=?").get(dst.id, dstCh, lf.title) : null;
        if (dup) {
          // 去重:把来源点的所有引用重映射到目标已有点,再删来源点。
          for (const tbl of ["questions", "attempts", "insights", "explanations"]) {
            const r = db.prepare(`UPDATE ${tbl} SET kp_id=? WHERE kp_id=?`).run(dup.id, lf.id);
            stats.remappedRefs += r.changes;
          }
          db.prepare("DELETE FROM knowledge_points WHERE id=?").run(lf.id);
          stats.dedupedKps++;
        } else {
          // 无重复:整点搬过去(kp_id 不变,引用天然保持)。
          db.prepare("UPDATE knowledge_points SET exam_id=?, parent_id=? WHERE id=?").run(dst.id, dstCh, lf.id);
          stats.movedKps++;
        }
      }
      // 来源剩下的章节(空壳)删掉。
      db.prepare("DELETE FROM knowledge_points WHERE exam_id=? AND parent_id IS NULL").run(src.id);

      // 记录哪些搬过来的题带作答(稍后重算遗忘曲线)。
      for (const q of db.prepare("SELECT id FROM questions WHERE exam_id=?").all(src.id)) {
        if (db.prepare("SELECT 1 FROM attempts WHERE question_id=? LIMIT 1").get(q.id)) withAttQ.push(q.id);
      }
      // 把来源的题/作答/洞察统一改挂到目标(kp_id 已在上面处理好)。
      stats.movedQuestions += db.prepare("UPDATE questions SET exam_id=? WHERE exam_id=?").run(dst.id, src.id).changes;
      stats.movedAttempts += db.prepare("UPDATE attempts SET exam_id=? WHERE exam_id=?").run(dst.id, src.id).changes;
      db.prepare("UPDATE insights SET exam_id=? WHERE exam_id=?").run(dst.id, src.id);

      // documents:唯一(exam_id,type)——目标缺的类型才搬,已有的丢弃来源那份。
      for (const d of db.prepare("SELECT id,type FROM documents WHERE exam_id=?").all(src.id)) {
        const clash = db.prepare("SELECT 1 FROM documents WHERE exam_id=? AND type=?").get(dst.id, d.type);
        if (clash) db.prepare("DELETE FROM documents WHERE id=?").run(d.id);
        else db.prepare("UPDATE documents SET exam_id=? WHERE id=?").run(dst.id, d.id);
      }
      // daily_plans:唯一(exam_id,date)——同理。
      for (const p of db.prepare("SELECT id,date FROM daily_plans WHERE exam_id=?").all(src.id)) {
        const clash = db.prepare("SELECT 1 FROM daily_plans WHERE exam_id=? AND date=?").get(dst.id, p.date);
        if (clash) db.prepare("DELETE FROM daily_plans WHERE id=?").run(p.id);
        else db.prepare("UPDATE daily_plans SET exam_id=? WHERE id=?").run(dst.id, p.id);
      }
      // 其余带 exam_id 的表:直接改挂。
      for (const tbl of PLAIN_EXAM_TABLES) {
        try { db.prepare(`UPDATE ${tbl} SET exam_id=? WHERE exam_id=?`).run(dst.id, src.id); } catch {}
      }

      // 子考试改挂:若 target 本来就挂在 src 下,让 target 顶替 src 的位置。
      if (Number(dst.parent_exam_id) === Number(src.id)) {
        db.prepare("UPDATE exams SET parent_exam_id=? WHERE id=?").run(src.parent_exam_id || null, dst.id);
      }
      for (const c of db.prepare("SELECT id FROM exams WHERE parent_exam_id=? AND deleted_at IS NULL").all(src.id)) {
        if (Number(c.id) === Number(dst.id)) continue; // 已在上面处理
        if (wouldCycle(c.id, dst.id)) db.prepare("UPDATE exams SET parent_exam_id=? WHERE id=?").run(src.parent_exam_id || null, c.id);
        else db.prepare("UPDATE exams SET parent_exam_id=? WHERE id=?").run(dst.id, c.id);
        stats.reparentedChildren++;
      }
      // 软删来源。
      db.prepare("UPDATE exams SET deleted_at=datetime('now'), parent_exam_id=NULL WHERE id=?").run(src.id);
    });
    tx();

    for (const qid of withAttQ) { try { recomputeReviewFromAttempts(qid); } catch {} }
    try { invalidateKnowledgeState(dst.id); } catch {}
    try { invalidateKnowledgeState(src.id); } catch {}
    return { ok: true, sourceExamId: src.id, targetExamId: dst.id, ...stats };
  },
});

// ───────────────────────────── exam_split ─────────────────────────────
registerBrick({
  name: "exam_split", category: "cross_exam", title: "拆分:把若干知识点拆到一门新/已有考试(移动)", write: true,
  description: "把 fromExamId 里指定的 kpIds(叶子知识点)【搬到】另一门考试:连它们的题目、作答记录(掌握度)、讲解一起移动,来源里就没有这些点了。目标可以是新建(给 newExamName)或已有(给 toExamId)。asChild=true 时把目标考试挂到来源考试下作为小任务(自动防环)。事务化、保持引用完整性;复习队列按 question_id 自动跟随。【破坏性】会把数据从来源移走,调用前请向用户确认。",
  inputs: [
    { key: "fromExamId", type: "number", required: true, desc: "来源考试 id" },
    { key: "kpIds", type: "json", required: true, desc: "要拆走的叶子知识点 id 数组(必须属于 fromExamId)" },
    { key: "newExamName", type: "string", required: false, desc: "新建目标考试的名字(与 toExamId 二选一)" },
    { key: "toExamId", type: "number", required: false, desc: "搬到这门已有考试(与 newExamName 二选一)" },
    { key: "asChild", type: "boolean", required: false, desc: "把目标考试挂到来源考试下作为小任务(默认否)" },
  ],
  run: async (args, ctx) => {
    const from = own(ctx.user.id, args.fromExamId);
    if (!from) throw new Error("fromExam not found/owned");
    const kpIds = (Array.isArray(args.kpIds) ? args.kpIds : []).map(Number).filter(Boolean);
    if (!kpIds.length) throw new Error("kpIds 为空");
    // 校验这些点都是 fromExam 的叶子点。
    const leaves = db.prepare(`SELECT id,title,parent_id,coverage FROM knowledge_points WHERE exam_id=? AND parent_id IS NOT NULL AND id IN (${kpIds.map(() => "?").join(",")})`).all(from.id, ...kpIds);
    if (!leaves.length) throw new Error("没有一个 kpId 属于 fromExamId 的叶子知识点");
    if (!args.newExamName && !args.toExamId) throw new Error("必须给 newExamName(新建)或 toExamId(已有)其一");

    const stats = { movedKps: 0, movedQuestions: 0, movedAttempts: 0 };
    let toId = args.toExamId ? Number(args.toExamId) : null;
    const withAttQ = [];

    const tx = db.transaction(() => {
      if (toId) {
        const to = own(ctx.user.id, toId);
        if (!to) throw new Error("toExam not found/owned");
        if (to.id === from.id) throw new Error("目标不能是来源自己");
      } else {
        toId = db.prepare("INSERT INTO exams(name,user_id,status,parent_exam_id,assess_status) VALUES(?,?,?,?,'done')")
          .run(String(args.newExamName).slice(0, 120), ctx.user.id, "active", null).lastInsertRowid;
      }
      const dstChapterId = (title) => {
        const t = (title || "补充").trim() || "补充";
        const ch = db.prepare("SELECT id FROM knowledge_points WHERE exam_id=? AND parent_id IS NULL AND title=?").get(toId, t);
        if (ch) return ch.id;
        return db.prepare("INSERT INTO knowledge_points(exam_id,parent_id,title,coverage) VALUES(?,?,?,?)").run(toId, null, t, "none").lastInsertRowid;
      };
      for (const lf of leaves) {
        const dstCh = dstChapterId(chTitle(lf.parent_id));
        // 搬点(kp_id 不变);把这些点的题/作答/洞察 exam_id 改挂到目标。
        db.prepare("UPDATE knowledge_points SET exam_id=?, parent_id=? WHERE id=?").run(toId, dstCh, lf.id);
        for (const q of db.prepare("SELECT id FROM questions WHERE kp_id=?").all(lf.id)) {
          if (db.prepare("SELECT 1 FROM attempts WHERE question_id=? LIMIT 1").get(q.id)) withAttQ.push(q.id);
        }
        stats.movedQuestions += db.prepare("UPDATE questions SET exam_id=? WHERE kp_id=?").run(toId, lf.id).changes;
        stats.movedAttempts += db.prepare("UPDATE attempts SET exam_id=? WHERE kp_id=?").run(toId, lf.id).changes;
        db.prepare("UPDATE insights SET exam_id=? WHERE kp_id=?").run(toId, lf.id);
        stats.movedKps++;
      }
      // 清掉来源里因搬空而没有叶子的章节。
      db.prepare(`DELETE FROM knowledge_points WHERE exam_id=? AND parent_id IS NULL AND id NOT IN (SELECT DISTINCT parent_id FROM knowledge_points WHERE exam_id=? AND parent_id IS NOT NULL)`).run(from.id, from.id);
      if (args.asChild) {
        if (wouldCycle(toId, from.id)) throw new Error("asChild 会形成环,已拒绝");
        db.prepare("UPDATE exams SET parent_exam_id=? WHERE id=?").run(from.id, toId);
      }
    });
    tx();

    for (const qid of withAttQ) { try { recomputeReviewFromAttempts(qid); } catch {} }
    try { invalidateKnowledgeState(from.id); invalidateKnowledgeState(toId); } catch {}
    return { ok: true, fromExamId: from.id, toExamId: toId, createdNew: !args.toExamId, ...stats };
  },
});

// ─────────────────────────── exam_integrity_check ───────────────────────────
registerBrick({
  name: "exam_integrity_check", category: "cross_exam", title: "体检:引用完整性 / 归属一致性 / 父子环", write: false,
  description: "扫描当前用户的数据,报告:①孤儿 kp_id(题目/作答/洞察/讲解指向已不存在的知识点)②exam/kp 归属不一致(某题或作答的 exam_id 与其知识点所属考试不符)③复习队列里指向已不存在题目的孤儿 ④考试 parent_exam_id 悬空/指向已删除/自指/成环。fix=true 时就地修复(孤儿 kp_id 置空、归属按知识点纠正、删复习孤儿、断开坏的父子指向)。默认只报告不改。",
  inputs: [{ key: "fix", type: "boolean", required: false, desc: "是否就地修复(默认否,仅报告)" }],
  run: async (args, ctx) => {
    const fix = !!args.fix;
    const uid = ctx.user.id;
    const myExams = db.prepare("SELECT id,parent_exam_id,deleted_at FROM exams WHERE user_id=?").all(uid);
    const alive = new Set(myExams.filter((e) => !e.deleted_at).map((e) => e.id));
    const scope = "(" + (myExams.map((e) => e.id).join(",") || "0") + ")";
    const report = { orphanKpRefs: {}, examKpMismatch: {}, reviewOrphans: 0, badParents: [], cycles: [], fixed: 0 };

    const kpExam = (kpId) => db.prepare("SELECT exam_id FROM knowledge_points WHERE id=?").get(kpId)?.exam_id || null;

    // ① 孤儿 kp_id + ② 归属不一致(questions/attempts/insights 带 exam_id+kp_id)
    for (const tbl of ["questions", "attempts", "insights"]) {
      const rows = db.prepare(`SELECT id, exam_id, kp_id FROM ${tbl} WHERE exam_id IN ${scope} AND kp_id IS NOT NULL`).all();
      let orphan = 0, mismatch = 0;
      for (const r of rows) {
        const ke = kpExam(r.kp_id);
        if (ke == null) { orphan++; if (fix) { db.prepare(`UPDATE ${tbl} SET kp_id=NULL WHERE id=?`).run(r.id); report.fixed++; } }
        else if (Number(ke) !== Number(r.exam_id)) { mismatch++; if (fix) { db.prepare(`UPDATE ${tbl} SET exam_id=? WHERE id=?`).run(ke, r.id); report.fixed++; } }
      }
      if (orphan) report.orphanKpRefs[tbl] = orphan;
      if (mismatch) report.examKpMismatch[tbl] = mismatch;
    }
    // explanations 只有 kp_id
    {
      const rows = db.prepare("SELECT id, kp_id FROM explanations WHERE kp_id IS NOT NULL").all();
      let orphan = 0;
      for (const r of rows) {
        const ke = kpExam(r.kp_id);
        if (ke == null) { orphan++; if (fix) { db.prepare("DELETE FROM explanations WHERE id=?").run(r.id); report.fixed++; } }
      }
      if (orphan) report.orphanKpRefs.explanations = orphan;
    }
    // ③ 复习队列孤儿(question 不存在)
    {
      const rows = db.prepare(`SELECT rq.id FROM review_queue rq LEFT JOIN questions q ON q.id=rq.question_id WHERE q.id IS NULL`).all();
      report.reviewOrphans = rows.length;
      if (fix) for (const r of rows) { db.prepare("DELETE FROM review_queue WHERE id=?").run(r.id); report.fixed++; }
    }
    // ④ 父子悬空 / 指向已删 / 自指 / 成环
    for (const e of myExams) {
      if (e.deleted_at) continue;
      if (!e.parent_exam_id) continue;
      if (Number(e.parent_exam_id) === Number(e.id)) { report.badParents.push({ examId: e.id, reason: "self" }); if (fix) { db.prepare("UPDATE exams SET parent_exam_id=NULL WHERE id=?").run(e.id); report.fixed++; } continue; }
      if (!alive.has(Number(e.parent_exam_id))) { report.badParents.push({ examId: e.id, reason: "dangling", parent: e.parent_exam_id }); if (fix) { db.prepare("UPDATE exams SET parent_exam_id=NULL WHERE id=?").run(e.id); report.fixed++; } continue; }
      // 环:沿祖先链上溯,若回到自己即成环。
      let cur = db.prepare("SELECT id,parent_exam_id FROM exams WHERE id=? AND deleted_at IS NULL").get(e.parent_exam_id), guard = 0, cyc = false;
      const seen = new Set([e.id]);
      while (cur && cur.parent_exam_id && guard++ < 100) {
        if (seen.has(cur.id)) { cyc = true; break; }
        seen.add(cur.id);
        cur = db.prepare("SELECT id,parent_exam_id FROM exams WHERE id=? AND deleted_at IS NULL").get(cur.parent_exam_id);
      }
      if (cyc) { report.cycles.push(e.id); if (fix) { db.prepare("UPDATE exams SET parent_exam_id=NULL WHERE id=?").run(e.id); report.fixed++; } }
    }
    const clean = !Object.keys(report.orphanKpRefs).length && !Object.keys(report.examKpMismatch).length && !report.reviewOrphans && !report.badParents.length && !report.cycles.length;
    return { clean, fix, ...report };
  },
});
