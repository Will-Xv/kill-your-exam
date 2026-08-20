// 类1:极简诊断「该从哪开始」。确定性(读掌握度矩阵,不花 token):
// - 数据太薄 → 给一份广度抽样(每章挑一个最没练的点),先花几分钟测出真实底子。
// - 有数据 → 指出哪些章已经稳(可略过)、从哪章的哪个点开始,给出第一步。
import { masteryMatrix } from "@/lib/mastery";

export function whereToStart(exam, { minutes } = {}) {
  const matrix = masteryMatrix(exam.id);
  if (!matrix.length) return { mode: "no_kp" };
  const byCh = {};
  for (const m of matrix) {
    const c = m.chapter || "—";
    const b = (byCh[c] = byCh[c] || { chapter: c, total: 0, attempted: 0, weak: 0, ok: 0, mastered: 0, unlearned: 0, accSum: 0 });
    b.total++;
    if (m.attempts > 0) { b.attempted++; b.accSum += m.accuracy; }
    b[m.level] = (b[m.level] || 0) + 1;
  }
  const chapters = Object.values(byCh).map((b) => ({
    chapter: b.chapter, total: b.total, attempted: b.attempted,
    weak: b.weak, mastered: b.mastered, unlearned: b.unlearned,
    acc: b.attempted ? Math.round(b.accSum / b.attempted) : null,
    masteredRatio: b.total ? b.mastered / b.total : 0, gap: b.weak + b.unlearned,
  }));
  const totalAttempts = matrix.reduce((a, m) => a + m.attempts, 0);

  // 【广度抽样 = 小测的选点】每章按「最没练→次没练」排队,再横向轮询取,保证广度优先、够时间就往深挖。
  // ★以前这段【只在 totalAttempts < 6 时才算】,于是用户一旦做过几道题,小测入口就永久消失、
  //   到处都找不到(Will 反馈)。现在【不论有没有数据都算一份】,让小测随时可以做。
  const budget = Math.max(3, Math.min(20, minutes ? Math.round(minutes / 2) : 6));
  const queues = chapters.map((ch) => matrix.filter((m) => (m.chapter || "—") === ch.chapter).sort((a, b) => a.attempts - b.attempts));
  const sample = [];
  for (let round = 0; sample.length < budget && queues.some((q) => q.length > round); round++) {
    for (const q of queues) { if (sample.length >= budget) break; const kp = q[round]; if (kp) sample.push({ kpId: kp.id, title: kp.title, chapter: kp.chapter }); }
  }
  const quickTest = { sample, minutes: sample.length * 2, chaptersTotal: chapters.length };

  // 数据太薄:先测底子(此时界面以小测为主)
  if (totalAttempts < 6) {
    return { mode: "needTest", sample, quickTest, chaptersTotal: chapters.length, minutes: sample.length * 2, suggestMock: chapters.length >= 3 };
  }

  // 有数据:哪些章稳了(可略过/只巩固)、从哪几章开始
  const solid = chapters.filter((c) => c.attempted > 0 && c.masteredRatio >= 0.6).map((c) => c.chapter);
  const start = chapters.slice()
    .sort((a, b) => (a.acc == null ? -1 : a.acc) - (b.acc == null ? -1 : b.acc) || b.gap - a.gap)
    .filter((c) => c.gap > 0).slice(0, 3)
    .map((c) => ({ chapter: c.chapter, acc: c.acc, weak: c.weak, unlearned: c.unlearned }));
  const startCh = start[0] ? start[0].chapter : null;
  let firstAction = null;
  if (startCh) {
    const fk = matrix.filter((m) => (m.chapter || "—") === startCh && (m.level === "weak" || m.attempts === 0))
      .sort((a, b) => (a.accuracy || 0) - (b.accuracy || 0) || a.attempts - b.attempts)[0];
    if (fk) firstAction = { kpId: fk.id, title: fk.title, chapter: startCh };
  }
  return { mode: "advise", solid, start, firstAction, totalAttempts, quickTest, suggestMock: true };
}
