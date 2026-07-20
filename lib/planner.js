// 跨考试自适应规划器:把用户所有考试按 紧迫度(考试日期)× 提分空间(薄弱/未学)× 遗忘(到期复习)算优先级,
// 动态分配每天时间,并给出"今天最该做的一件事"。类1/3/7/13/17 的地基。
import db, { rootExamId, getSetting, familyScope } from "@/lib/db";
import { examSummary, dueReviewCount, masteryMatrix } from "@/lib/mastery";
import { todayStr } from "@/lib/devtime";

// 从参考日期算到考试日期还有几天(refDateStr 省略=今天)。
function daysUntil(dateStr, refDateStr) {
  if (!dateStr) return null;
  const d = new Date(String(dateStr).slice(0, 10) + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const t0 = new Date((refDateStr || todayStr()) + "T00:00:00");   // 无参考日=用户时区的今天
  return Math.round((d.getTime() - t0.getTime()) / 86400000);
}

function listTopExams(userId) {
  // 顶层考试(parent_exam_id IS NULL);子考试由 examSummary 家族聚合。排除已删+已完成+未建完(setup_state=draft/generating)。
  const q = (extra) => { try { return db.prepare("SELECT id,name,exam_date,daily_minutes,parent_exam_id FROM exams WHERE user_id=? AND deleted_at IS NULL" + extra + " ORDER BY id").all(userId); } catch { return null; } };
  let rows = q(" AND parent_exam_id IS NULL AND completed_at IS NULL AND (setup_state IS NULL OR setup_state NOT IN ('draft','generating'))");
  if (rows == null) rows = q(" AND parent_exam_id IS NULL");   // 老库可能没 setup_state
  if (rows == null || rows.length === 0) rows = q("") || [];   // 再退一步:该用户全部未删考试
  return rows;
}

// 把一门考试压成规划所需的静态画像(与日期无关的部分):提分空间/薄弱点/到期复习。
function summarizeExam(ex) {
  let s; try { s = examSummary(ex.id); } catch { s = { kpTotal: 0, weak: [], mastered: [], accuracy: 0 }; }
  const due = (() => { try { return dueReviewCount(ex.id); } catch { return 0; } })();
  const weakN = s.weak.length;
  const unlearnedN = Math.max(0, s.kpTotal - weakN - s.mastered.length);
  const gap = s.kpTotal ? (weakN + unlearnedN) / s.kpTotal : 0.5;             // 提分空间 0~1
  const rootCauseKps = s.rootCauseKps || [];
  // 挑给今日任务的知识点:薄弱 + 未学,根因优先(与首页今日任务【同一套】选取逻辑,保证两边一致、且不会只有一个点)。
  let mm = []; try { mm = masteryMatrix(ex.id); } catch {}
  const rank = { weak: 0, unlearned: 1, ok: 2, mastered: 3 };
  const cover = { covered: 0, partial: 1, none: 2 };
  const mergedWeak = mm.filter((k) => k.level === "weak" || k.level === "unlearned")
    .sort((a, b) => (b.rootCause ? 1 : 0) - (a.rootCause ? 1 : 0) || rank[a.level] - rank[b.level] || cover[a.coverage] - cover[b.coverage] || a.attempts - b.attempts)
    .map((k) => ({ id: k.id, title: k.title, rootCause: !!k.rootCause }));
  return { id: ex.id, name: ex.name, examDate: ex.exam_date || null, dailyMinutes: ex.daily_minutes || 60,
    kpTotal: s.kpTotal, weak: weakN, unlearned: unlearnedN, mastered: s.mastered.length, accuracy: s.accuracy,
    due, gap, weakTitles: s.weak.slice(0, 3), weakKps: mergedWeak, rootCauseKps, rootCauseCount: rootCauseKps.length };
}

// 某考试在参考日期下的优先级分数(紧迫度×提分空间 + 到期复习)。
function scoreFor(row, refDateStr, mode) {
  const daysLeft = daysUntil(row.examDate, refDateStr);
  const urgency = daysLeft == null ? 1 : Math.max(0.2, Math.min(5, 21 / (Math.max(0, daysLeft) + 1)));
  const dueW = Math.min(2, row.due / 10);
  let score = urgency * (0.5 + row.gap) + dueW * 0.5;
  if (row.rootCauseCount > 0) score += Math.min(1.5, row.rootCauseCount * 0.4); // 有根因知识点 → 该考试更该优先
  if (mode === "sprint" && daysLeft != null && daysLeft <= 3) score *= 2; // 急救/冲刺:临考再加权
  return { score: +score.toFixed(2), daysLeft };
}

// 给一门考试在分到 allocMinutes 分钟下,拆出今日具体任务清单。
function buildTasks(row, allocMinutes, sprint) {
  const tasks = []; let left = Math.max(10, allocMinutes);
  if (row.due > 0) { const m = Math.min(left, sprint ? Math.round(left * 0.5) : 15); tasks.push({ type: "review", label: `复习到期的 ${row.due} 道题`, count: row.due, minutes: m, href: "/practice?mode=review" }); left -= m; }
  for (const kp of (row.weakKps || []).slice(0, 2)) { if (left <= 6) break; const m = Math.min(left, 15); tasks.push({ type: "kp", title: kp.title, kpId: kp.id, minutes: m, root: !!kp.rootCause, href: `/practice?kp=${kp.id}` }); left -= m; }
  if (!sprint && left >= 8) tasks.push({ type: "free", label: "自由练习一组", minutes: Math.min(left, 15), href: "/practice?fresh=1" }); // 封顶≈一组题,别把剩余时间全塞进自由练习(和今日任务一致);冲刺模式不铺新题
  return tasks;
}

// 核心分配:给定一组静态画像 + 参考日期 + 总时长,算出每门的分数/分钟/任务,并挑出"最该做的一件事"。
function allocate(summaries, { totalMinutes, mode, refDateStr } = {}) {
  const sprint = mode === "sprint";
  const rows = summaries.map((r) => { const { score, daysLeft } = scoreFor(r, refDateStr, mode); return { ...r, score, daysLeft, weakKps: r.weakKps }; });
  const sumScore = rows.reduce((a, r) => a + r.score, 0);
  const total = totalMinutes || rows.reduce((a, r) => a + (r.dailyMinutes || 0), 0) || 90;
  for (const r of rows) r.allocMinutes = sumScore > 0 ? Math.round(total * r.score / sumScore) : Math.round(total / (rows.length || 1));
  for (const r of rows) r.tasks = buildTasks(r, r.allocMinutes, sprint);
  rows.sort((a, b) => b.score - a.score);
  const top = rows[0];
  const topTask = !top ? null
    : top.due > 0 ? { examId: top.id, exam: top.name, action: "review", count: top.due, text: `复习「${top.name}」到期的 ${top.due} 道题`, minutes: Math.min(top.allocMinutes, 25) }
    : top.weakTitles.length ? { examId: top.id, exam: top.name, action: "weak", title: top.weakTitles[0], text: `攻「${top.name}」的薄弱点:${top.weakTitles[0]}`, minutes: Math.min(top.allocMinutes, 30) }
    : { examId: top.id, exam: top.name, action: "practice", text: `练一练「${top.name}」`, minutes: Math.min(top.allocMinutes, 20) };
  // 对外仍保留原字段(去掉内部 gap 以外都保留);weakTitles 保留供调用方。
  const exams = rows.map((r) => ({ id: r.id, name: r.name, examDate: r.examDate, daysLeft: r.daysLeft, dailyMinutes: r.dailyMinutes,
    kpTotal: r.kpTotal, weak: r.weak, unlearned: r.unlearned, mastered: r.mastered, accuracy: r.accuracy, due: r.due,
    score: r.score, weakTitles: r.weakTitles, weakKps: r.weakKps, allocMinutes: r.allocMinutes, tasks: r.tasks }));
  return { exams, totalMinutes: total, topTask };
}

// 今日单日规划(向后兼容:字段与原实现一致)。
// 可行性检查(类5):考试前剩余时间够不够把薄弱/未学的知识点过完?够不够就诚实报警 + 给折中。
function feasibility(e) {
  if (e.daysLeft == null) return null;                          // 没考期,不判
  const needMin = (e.weak + e.unlearned) * 12 + e.due * 2;      // 粗估:每个薄弱/未学点约12分钟过一遍 + 到期复习每题2分钟
  const availMin = Math.max(0, e.daysLeft) * (e.dailyMinutes || 60);
  if (needMin <= 0) return { feasible: true, needMin, availMin };
  const ratio = availMin > 0 ? needMin / availMin : Infinity;
  const feasible = ratio <= 1.2;                                // 留20%缓冲
  let advice = null;
  if (!feasible) {
    const needDaily = e.daysLeft > 0 ? Math.ceil(needMin / e.daysLeft) : needMin;
    advice = { needHours: +(needMin / 60).toFixed(1), availHours: +(availMin / 60).toFixed(1), suggestDailyMin: needDaily, suggestExtendDays: Math.ceil(needMin / (e.dailyMinutes || 60)) - Math.max(0, e.daysLeft) };
  }
  return { feasible, needMin, availMin, ratio: +ratio.toFixed(2), advice };
}

export function crossExamPlan(userId, { totalMinutes, mode } = {}) {
  const summaries = listTopExams(userId).map(summarizeExam);
  const { exams, totalMinutes: total, topTask } = allocate(summaries, { totalMinutes, mode, refDateStr: null });
  for (const e of exams) e.feasibility = feasibility(e);
  const warnings = exams.filter((e) => e.feasibility && e.feasibility.feasible === false)
    .map((e) => ({ examId: e.id, name: e.name, daysLeft: e.daysLeft, ...e.feasibility.advice }));
  return { exams, totalMinutes: total, topTask, examCount: exams.length, warnings };
}

// 多天排期(类13.3):dayCaps = [{date:'YYYY-MM-DD', minutes:Number}, ...] 连续若干天(从今天起)。
// 每天按"那一天"的紧迫度重新分配那天的可用分钟;已过考试日期的考试当天不再排;容量为 0 的天跳过。
export function weekPlan(userId, { dayCaps, mode } = {}) {
  const summaries = listTopExams(userId).map(summarizeExam);
  if (!Array.isArray(dayCaps) || !dayCaps.length) return { days: [], examCount: summaries.length };
  const days = [];
  for (const cap of dayCaps.slice(0, 21)) {
    const minutes = Math.max(0, Number(cap.minutes) || 0);
    const dateStr = String(cap.date || "").slice(0, 10);
    if (minutes <= 0) { days.push({ date: dateStr, totalMinutes: 0, rest: true, exams: [], topTask: null }); continue; }
    // 当天仍"活着"的考试:没有考试日期,或考试日期 >= 当天。
    const live = summaries.filter((r) => { const dl = daysUntil(r.examDate, dateStr); return dl == null || dl >= 0; });
    if (!live.length) { days.push({ date: dateStr, totalMinutes: minutes, rest: false, exams: [], topTask: null }); continue; }
    const { exams, topTask } = allocate(live, { totalMinutes: minutes, mode, refDateStr: dateStr });
    days.push({ date: dateStr, totalMinutes: minutes,
      exams: exams.map((e) => ({ examId: e.id, name: e.name, daysLeft: e.daysLeft, allocMinutes: e.allocMinutes, top: e.tasks[0] || null })),
      topTask });
  }
  return { days, examCount: summaries.length };
}


// 类4:保守 / 激进 两个版本的今日计划。两者【共用同一份错题本/掌握度数据】(summaries 同源),
// 只是策略强度不同:保守=先清到期+稳固少量薄弱,不铺新内容;激进=多攻薄弱+铺未学新章节+加练。
function variantTasks(row, allocMinutes, profile) {
  const tasks = []; let left = Math.max(10, allocMinutes);
  if (row.due > 0) { const m = Math.min(left, Math.round(left * profile.reviewShare)); if (m > 0) { tasks.push({ type: "review", label: `复习到期的 ${row.due} 道题`, count: row.due, minutes: m, href: "/practice?mode=review" }); left -= m; } }
  for (const kp of (row.weakKps || []).slice(0, profile.weakCap)) { if (left <= 6) break; const m = Math.min(left, 15); tasks.push({ type: "kp", title: kp.title, kpId: kp.id, minutes: m, root: !!kp.rootCause, href: `/practice?kp=${kp.id}` }); left -= m; }
  if (profile.includeUnlearned && row.unlearned > 0 && left >= 8) { const m = Math.min(left, 20); tasks.push({ type: "learn", label: `学 1 个未学章节(还有 ${row.unlearned} 个未学)`, minutes: m, href: "/study" }); left -= m; }
  if (profile.fresh && left >= 8) tasks.push({ type: "free", label: "自由练习一组", minutes: left, href: "/practice?fresh=1" });
  return tasks;
}

export function planVariants(userId, { totalMinutes } = {}) {
  const summaries = listTopExams(userId).map(summarizeExam);
  const base = allocate(summaries, { totalMinutes, mode: null, refDateStr: null }); // 复用同一套分数/分钟分配
  const PROFILES = {
    conservative: { weakCap: 2, includeUnlearned: false, fresh: false, reviewShare: 0.5 },
    aggressive: { weakCap: 4, includeUnlearned: true, fresh: true, reviewShare: 0.3 },
  };
  const byId = new Map(summaries.map((r) => [r.id, r]));
  const build = (profile) => {
    const exams = base.exams.map((e) => {
      const row = byId.get(e.id) || e;
      const tasks = variantTasks({ ...e, weakKps: row.weakKps, due: e.due, unlearned: e.unlearned }, e.allocMinutes, profile);
      const coverToday = tasks.filter((tk) => tk.type === "kp" || tk.type === "learn").length + (tasks.some((tk) => tk.type === "review") ? 1 : 0);
      return { id: e.id, name: e.name, daysLeft: e.daysLeft, allocMinutes: e.allocMinutes, weak: e.weak, unlearned: e.unlearned, due: e.due, tasks, coverToday };
    });
    const points = exams.reduce((a, e) => a + e.tasks.filter((tk) => tk.type === "kp" || tk.type === "learn").length, 0);
    return { exams, totalMinutes: base.totalMinutes, pointsToday: points, coversUnlearned: profile.includeUnlearned };
  };
  return {
    totalMinutes: base.totalMinutes,
    conservative: build(PROFILES.conservative),
    aggressive: build(PROFILES.aggressive),
    sharedNote: "两个版本共用同一个错题本和掌握度——不管你今天走哪个版本,做错的题都进同一个错题本,进度也算在一起。",
  };
}

// 共享:当前生效的"今日任务" items(custom 优先,否则从 crossExamPlan 实时推导)。/api/daily 与 tweak/customize 砖头共用,保证同源。
// 【按任务日期分配知识点】家族里带日期的考核(子/母考试按 exam_date、作业按 due_date+kp_id)各自覆盖一组知识点;
// 取【最近到期且还有未掌握知识点】的那个考核,把它的薄弱/未学知识点按剩余天数铺开,返回【今天该练的那一小批】。
// 严格锚定考核日期,而不是把所有知识点均匀摊到考试日 —— 自由练习就练这一批。
// 【当前周期】= 家族里最近一个【还没到的、带日期的考核】(子/母考试)。没有任何日期 → null(整门课当一个周期)。
export function upcomingCycles(exam, today) {
  const famIds = (familyScope(exam.id) || []).map(Number);
  if (!famIds.length) return [];
  const out = [];
  try {
    for (const e of db.prepare(`SELECT id, name, exam_date FROM exams WHERE id IN (${famIds.join(",")}) AND exam_date IS NOT NULL AND deleted_at IS NULL`).all()) {
      const d = String(e.exam_date).slice(0, 10);
      if (d < today) continue;
      out.push({ examId: Number(e.id), name: e.name, date: d, daysLeft: daysUntil(e.exam_date, today) });
    }
  } catch {}
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

// 【自由练习薄弱点】只取【根因 + 薄弱】(不含未学——未学归"学新知识"那条管)。
// 优先本周期范围内的;本周期没有薄弱点了才回捞更早单元的旧薄弱点,并标 outOfCycle(界面要说清"这不是本次考核的范围")。
export function weakAnchor(exam, today) {
  let mm = [];
  try { mm = masteryMatrix(exam.id); } catch { return null; }
  const isWeak = (k) => k.rootCause || k.level === "weak";
  const cyc = upcomingCycles(exam, today);
  const cur = cyc[0] || null;
  let pool = cur ? mm.filter((k) => Number(k.exam_id) === Number(cur.examId) && isWeak(k)) : mm.filter(isWeak);
  let outOfCycle = false;
  if (!pool.length && cur) { pool = mm.filter(isWeak); outOfCycle = pool.length > 0; } // 回捞旧薄弱
  if (!pool.length) return null;
  const pr = (k) => (k.rootCause ? 0 : 10) + Math.min(9, k.attempts || 0); // 根因优先,其次做得少的
  const take = pool.slice().sort((a, b) => pr(a) - pr(b)).slice(0, 6);
  return {
    kpIds: take.map((k) => Number(k.id)),
    kps: take.map((k) => ({ id: k.id, title: k.title, chapter: k.chapter || null, level: k.level, rootCause: !!k.rootCause })),
    outOfCycle, cycle: cur,
  };
}

// 【学新知识】做够这么多题就算这个知识点学完了(学完当天就能换下一个,所以新知识是按完成推进、不跟日期走)。
export const NEW_KP_TARGET = 8;
// 今天建议做几题(按每天能学多久换算,给 AI/用户一个节奏参考;打勾只代表"今天这部分做完了",不代表知识点学完)
export function newKpDailyTarget(exam) {
  const m = Number(exam && exam.daily_minutes) || 60;
  return Math.max(3, Math.min(12, Math.round(m / 10)));
}
// 按【单元顺序】取本周期里第一个还没学完(做够 NEW_KP_TARGET 题)的知识点;本周期学完了就返回 ahead(下个周期的,可选·超前学)
export function newKnowledgeNext(exam, today) {
  let mm = [];
  try { mm = masteryMatrix(exam.id); } catch { return { kp: null, cycle: null, ahead: null }; }
  const cyc = upcomingCycles(exam, today);
  const cur = cyc[0] || null;
  const listOf = (c) => (c ? mm.filter((k) => Number(k.exam_id) === Number(c.examId)) : mm); // masteryMatrix 已按 章节sort→知识点sort 排好=单元顺序
  const pick = (arr) => arr.find((k) => (k.attempts || 0) < NEW_KP_TARGET) || null;
  const kp = pick(listOf(cur));
  if (kp) return { kp, cycle: cur, ahead: null };
  const nxt = cyc[1] || null;
  const aheadKp = nxt ? pick(listOf(nxt)) : null;
  return { kp: null, cycle: cur, ahead: aheadKp ? { kp: aheadKp, cycle: nxt } : null };
}

export function currentDailyItems(userId, exam) {
  const today = todayStr();
  const custom = db.prepare("SELECT * FROM daily_plans WHERE exam_id=? AND date=? AND custom=1").get(exam.id, today);
  if (custom) { try { return { items: JSON.parse(custom.items_json), custom: true, today }; } catch {} }
  let practicalMode = false;
  try { practicalMode = getSetting(`practical_mode:${exam.id}`) === "1"; } catch {}

  // 【固定三条】① 到期错题 ② 自由练习薄弱点(只练根因+薄弱) ③ 学一个新知识(按单元顺序推进)
  // 实践模式也是这三条(不再另外砍成"复习+轻量练习")——自由练习只练薄弱,不会塞莫名其妙的新题。
  const it = [{ type: "review" }];

  // ② 自由练习薄弱点
  try {
    const w = weakAnchor(exam, today);
    if (w && w.kpIds.length) {
      it.push({ type: "free", target: 10, kpIds: w.kpIds, weakKps: w.kps, outOfCycle: !!w.outOfCycle,
                anchor: w.cycle ? { name: w.cycle.name, date: w.cycle.date, daysLeft: w.cycle.daysLeft } : null });
    } else {
      it.push({ type: "free", target: 10, noWeak: true }); // 没有薄弱点可练(全绿):照常留一条自由练习
    }
  } catch { it.push({ type: "free", target: 10 }); }

  // ③ 学一个新知识
  try {
    const n = newKnowledgeNext(exam, today);
    const dailyTarget = newKpDailyTarget(exam);
    if (n.kp) {
      it.push({ type: "newkp", kpId: Number(n.kp.id), title: n.kp.title, chapter: n.kp.chapter || null,
                dailyTarget, kpDone: Math.min(NEW_KP_TARGET, n.kp.attempts || 0), kpTarget: NEW_KP_TARGET,
                cycleName: n.cycle ? n.cycle.name : null });
    } else {
      // 本周期已经没有新知识了 → 今日这条【自动算完成】;下个周期的作为「可选·超前学」附上,不计入完成
      it.push({ type: "newkp", cycleDone: true, dailyTarget, cycleName: n.cycle ? n.cycle.name : null,
                ahead: n.ahead ? { kpId: Number(n.ahead.kp.id), title: n.ahead.kp.title, chapter: n.ahead.kp.chapter || null,
                                   cycleName: n.ahead.cycle ? n.ahead.cycle.name : null } : null });
    }
  } catch {}

  return { items: it, custom: false, today, practicalMode };
}

