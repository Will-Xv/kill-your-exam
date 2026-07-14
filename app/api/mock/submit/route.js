import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { generateJson, generate, langInstruction, attachParts } from "@/lib/gemini";
import { mmOpts, materialParts } from "@/lib/rag";
import { saveMockAtt } from "@/lib/files";
import { leafKpList, recordCrossKp, updateReviewQueue } from "@/lib/mastery";
import { aiErrorResponse } from "@/lib/errors";
import { runRootCauseDiagnosis } from "@/lib/diagnose";

export const maxDuration = 300;

const DEFAULT_MARKS = { single: 2, multi: 3, judge: 1, fill: 3, short: 10, perform: 20 };
const norm = (s) => String(s || "").replace(/[\s,，、]/g, "").toUpperCase();

// 真正的判题(可能含多次 AI 阅卷,较慢)——放【后台】跑,不阻塞用户提交界面。
async function gradeMock(user, exam, mockId, ids, marksMap, answers, attachments) {
  let total = 0, got = 0, totalMarks = 0, gotMarks = 0;
  const byChapter = {}; const results = []; const answersOut = [];
  for (const qid of ids) {
    const q = db.prepare("SELECT * FROM questions WHERE id=?").get(qid);
    if (!q) continue;
    const ans = JSON.parse(q.answer);
    const ua = answers[qid];
    let correct = 0, gradeCross = null, shortScore = -1;
    if (q.qtype === "short") {
      const ap = await attachParts(attachments[qid]);
      const kpList = leafKpList(exam.id);
      const kpListStr = kpList.slice(0, 120).map((k) => `[${k.id}] ${k.chapter ? k.chapter + "/" : ""}${k.title}`).join("\n");
      const gradePrompt = `阅卷。题目:${JSON.parse(q.body).stem}\n评分要点:${ans.answer}\n考生答案:${ua || (ap.length ? "(见附件:手写/上传作答,请先识别其中内容)" : "(未答)")}\n给0~100分。(如题目涉及附件音频/图片,请结合附件评分)\n如果这份答案里【顺带】清楚体现出考生对【别的知识点】(不是本题知识点)的正确理解或错误理解,在 crossKp 里列出:正确理解->kind=understanding;主动说出错误理解/概念错误->kind=misconception;只是没涉及/看不出->不填。kpId 只能取自下面清单,要确凿才填。本题知识点id=${q.kp_id || 0}(不要放进 crossKp)。知识点清单:\n${kpListStr}` + langInstruction(user.lang);
      const gradeSchema = { type: "object", properties: { score: { type: "integer" },
        crossKp: { type: "array", items: { type: "object", properties: { kpId: { type: "integer" }, kind: { type: "string", enum: ["understanding", "misconception"] }, insight: { type: "string" } }, required: ["kpId", "kind"] } } }, required: ["score"] };
      let g;
      if (ap.length) {
        const mp = await materialParts(exam.id, { max: 4 });
        const res = await generate(null, { contents: [{ role: "user", parts: [{ text: gradePrompt }, ...ap, ...mp] }], jsonSchema: gradeSchema });
        g = JSON.parse(res.text);
      } else {
        g = await generateJson(gradePrompt, gradeSchema, await mmOpts(exam.id, gradePrompt));
      }
      shortScore = Math.max(0, Math.min(100, g.score || 0)); correct = shortScore >= 60 ? 1 : 0;
      gradeCross = g.crossKp;
    } else correct = norm(ua) === norm(ans.answer) ? 1 : 0;
    const scoreVal = shortScore >= 0 ? shortScore : (correct ? 100 : 0);
    const qMarks = marksMap[qid] != null ? marksMap[qid] : (DEFAULT_MARKS[q.qtype] ?? 2);
    const earnedMarks = Math.round(qMarks * (scoreVal / 100) * 10) / 10;
    const ch = q.kp_id ? (db.prepare("SELECT ch.title FROM knowledge_points kp LEFT JOIN knowledge_points ch ON ch.id=kp.parent_id WHERE kp.id=?").get(q.kp_id)?.title || "其他") : "其他";
    total++; got += correct; totalMarks += qMarks; gotMarks += earnedMarks;
    const insA = db.prepare("INSERT INTO attempts(question_id,exam_id,kp_id,user_answer,correct,score,mode) VALUES(?,?,?,?,?,?,'exam')")
      .run(qid, q.exam_id, q.kp_id, String(ua || ""), correct, scoreVal);
    const attemptId = insA.lastInsertRowid;
    try { updateReviewQueue(qid, correct); } catch {}
    results.push({ id: qid, qtype: q.qtype, correct, score: scoreVal, marks: qMarks, earned: earnedMarks, chapter: ch, answer: ans.answer, explanation: ans.explanation || "", attemptId });
    if (gradeCross) { try { recordCrossKp(exam.id, qid, gradeCross, q.kp_id); } catch {} }
    const atts = Array.isArray(attachments[qid]) ? attachments[qid] : [];
    if (atts.length) { try { saveMockAtt(attemptId, atts); } catch {} }
    const qbody = JSON.parse(q.body);
    answersOut.push({ qid, attemptId, qtype: q.qtype, stem: qbody.stem || "", options: qbody.options || [], ua: String(ua || ""), correct, score: scoreVal, marks: qMarks, earned: earnedMarks, chapter: ch, answer: ans.answer, explanation: ans.explanation || "", atts: atts.map((a) => ({ name: a.name, mime: a.mime })) });
    byChapter[ch] = byChapter[ch] || { total: 0, got: 0, totalMarks: 0, gotMarks: 0 };
    byChapter[ch].total++; byChapter[ch].got += correct; byChapter[ch].totalMarks += qMarks; byChapter[ch].gotMarks += earnedMarks;
  }
  const score = { total, got, totalMarks: Math.round(totalMarks * 10) / 10, gotMarks: Math.round(gotMarks * 10) / 10, pct: totalMarks ? Math.round((gotMarks / totalMarks) * 100) : (total ? Math.round((got / total) * 100) : 0), byChapter };
  db.prepare("UPDATE mock_exams SET score_json=?, answers_json=?, results_json=?, status='done' WHERE id=?")
    .run(JSON.stringify(score), JSON.stringify(answersOut), JSON.stringify(results), mockId);
  try { await runRootCauseDiagnosis(user, exam.id); } catch {} // 模拟考横跨各章 → 跑跨章节根因
}

export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    const { mockId, answers, attachments = {} } = await req.json();
    const mock = db.prepare("SELECT * FROM mock_exams WHERE id=?").get(mockId);
    if (!mock || mock.exam_id !== exam?.id) return forbidden();
    if (mock.status === "done" && mock.score_json) { // 已判过:直接返回
      return Response.json({ status: "done", score: JSON.parse(mock.score_json), results: mock.results_json ? JSON.parse(mock.results_json) : [] });
    }
    const cfg = JSON.parse(mock.config_json); const ids = cfg.questionIds; const marksMap = cfg.marks || {};
    // 标记为判题中 → 后台判题(Railway 常驻进程,后台 promise 可存活)→ 立即返回,不让用户干等。
    db.prepare("UPDATE mock_exams SET status='grading' WHERE id=?").run(mockId);
    Promise.resolve().then(() => gradeMock(user, exam, mockId, ids, marksMap, answers, attachments))
      .catch((e) => { try { db.prepare("UPDATE mock_exams SET status='failed' WHERE id=?").run(mockId); } catch {} });
    return Response.json({ status: "grading", mockId });
  } catch (e) { return aiErrorResponse(e); }
}
