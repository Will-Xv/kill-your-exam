import db, { inScope } from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { generate, generateJson, langInstruction, attachParts } from "@/lib/gemini";
import { materialParts } from "@/lib/rag";
import { updateReviewQueue, leafKpList, recordCrossKp, kpMasteryLevel, invalidateKnowledgeState } from "@/lib/mastery";
import { addFact, analyzeMistakeBg } from "@/lib/memory";
import { maybeAutoUpdateOverall } from "@/lib/overall";
import { onAnswer } from "@/lib/triggers";
import { aiErrorResponse } from "@/lib/errors";

export async function POST(req) {
  try {
    const { questionId, userAnswer, mode = "practice", attachments, dontKnow } = await req.json();
    const q = db.prepare("SELECT * FROM questions WHERE id=?").get(questionId);
    if (!q) return Response.json({ error: "not found" }, { status: 404 });
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    if (!exam || !inScope(exam.id, q.exam_id)) return forbidden();
    const ans = JSON.parse(q.answer);
    let correct, score, feedback = "", gradeCross = null;
    if (dontKnow) {
      correct = 0; score = 0;
      const ins = db.prepare("INSERT INTO attempts(question_id,exam_id,kp_id,user_answer,correct,score,feedback,mode) VALUES(?,?,?,?,?,?,?,?)")
        .run(questionId, q.exam_id, q.kp_id, "[不会做]", 0, 0, "", mode);
      updateReviewQueue(questionId, false);
      let autoTriggersDK = null; try { autoTriggersDK = onAnswer(user.id, q.exam_id, { correct: false, kpId: q.kp_id, questionId }); } catch {}
      maybeAutoUpdateOverall(user);
      return Response.json({ attemptId: ins.lastInsertRowid, correct: false, score: 0, dontKnow: true, autoTriggers: autoTriggersDK, answer: ans.answer, explanation: ans.explanation, source_type: q.source_type, source_refs: q.source_refs, origin: q.origin || "generated", answer_origin: q.answer_origin || "ai", source_url: q.source_url || null, is_real: !!q.is_real });
    }
    if (q.qtype === "short") {
      const kpList = leafKpList(q.exam_id);
      const kpListStr = kpList.slice(0, 120).map((k) => `[${k.id}] ${k.chapter ? k.chapter + "/" : ""}${k.title}`).join("\n");
      const gradeSchema = { type: "object", properties: { score: { type: "integer" }, feedback: { type: "string" },
        crossKp: { type: "array", description: "考生答案里【顺带】清楚体现出对【别的知识点】(不是本题知识点)的深刻理解或明显薄弱时列出;kpId 只能取自下面清单;要确凿才填,没有就空数组。", items: { type: "object", properties: { kpId: { type: "integer" }, kind: { type: "string", enum: ["understanding", "misconception"] }, insight: { type: "string" } }, required: ["kpId", "kind"] } }
      }, required: ["score", "feedback"] };
      const gradePrompt = `你是阅卷老师。题目:${JSON.parse(q.body).stem}
评分要点:${ans.answer}
考生答案:${userAnswer || "(见附件)"}
${attachments && attachments.length ? "考生以图片/文件形式作答(见附件),请识别其中内容再评分。" : ""}
按要点给 0~100 分,并指出答对了什么、缺了什么。数学公式用 $...$ 包裹。
如果这份答案里【顺带】清楚体现出考生对【别的知识点】(不是本题知识点)的态度,请在 crossKp 里列出,kpId 只能取自下面清单:正确扎实的理解->kind=understanding;主动说出【错误的理解/概念错误】->kind=misconception;只是没涉及/看不出懂不懂->不要填。要确凿才填、宁缺毋滥,没有就空数组。本题知识点id=${q.kp_id || 0}(不要放进 crossKp)。可引用的知识点清单:\n${kpListStr}` + langInstruction(user.lang);
      const ap = attachParts(attachments);
      const mp = materialParts(q.exam_id, { max: 4 });
      let g;
      if (ap.length || mp.length) {
        const res = await generate(null, { contents: [{ role: "user", parts: [{ text: gradePrompt }, ...ap, ...mp] }], jsonSchema: gradeSchema });
        g = JSON.parse(res.text);
      } else {
        g = await generateJson(gradePrompt, gradeSchema);
      }
      score = Math.max(0, Math.min(100, g.score));
      correct = score >= 60 ? 1 : 0;
      feedback = g.feedback;
      gradeCross = g.crossKp;
    } else {
      const norm = (s) => String(s || "").replace(/[\s,，、]/g, "").toUpperCase();
      correct = norm(userAnswer) === norm(ans.answer) ? 1 : 0;
      if (q.qtype === "fill" && !correct) {
        // 填空宽松匹配:包含关系也算对
        const a = norm(ans.answer), u = norm(userAnswer);
        if (a && u && (a.includes(u) || u.includes(a)) && u.length >= Math.min(2, a.length)) correct = 1;
      }
      score = correct ? 100 : 0;
    }
    const ins = db.prepare("INSERT INTO attempts(question_id,exam_id,kp_id,user_answer,correct,score,feedback,mode) VALUES(?,?,?,?,?,?,?,?)")
      .run(questionId, q.exam_id, q.kp_id, String(userAnswer || ""), correct, score, feedback, mode);
    updateReviewQueue(questionId, !!correct);
    let autoTriggers = null; try { autoTriggers = onAnswer(user.id, q.exam_id, { correct: !!correct, kpId: q.kp_id, questionId }); } catch {} // 确定性触发器:按已激活模式自动升/降难度等
    // 做题反映的熟悉度 -> 并入同一套记忆(冲突并存、按新近加权;和自述说法可相互印证)
    try {
      if (q.kp_id) {
        const lvl = kpMasteryLevel(q.kp_id);
        if (lvl && lvl !== "unlearned") {
          const kt = db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(q.kp_id)?.title || "该知识点";
          const _zh = !user.lang || String(user.lang).startsWith("zh");
          const label = (_zh ? { weak: "偏弱", ok: "一般", mastered: "较熟" } : { weak: "weak", ok: "fair", mastered: "solid" })[lvl] || lvl;
          addFact(user.id, q.exam_id, { subject: kt, kind: "observation", claim: _zh ? `做题反映:「${kt}」目前${label}` : `Practice shows: "${kt}" is currently ${label}`, valence: lvl, scope: "exam" });
        }
      }
      invalidateKnowledgeState(q.exam_id); // 做题后让知识状态摘要下次重算
      if (!correct) { // 错题:后台提炼细颗粒不熟条目(仅开发者账号,不阻塞)
        let stem = ""; try { stem = JSON.parse(q.body).stem; } catch {}
        const kt2 = q.kp_id ? (db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(q.kp_id)?.title || "") : "";
        analyzeMistakeBg(user, q.exam_id, { stem, userAnswer: String(userAnswer || ""), correctAnswer: ans.answer, kpTitle: kt2 });
      }
    } catch {}
    const masteryUpdates = gradeCross ? recordCrossKp(q.exam_id, questionId, gradeCross, q.kp_id) : [];
    maybeAutoUpdateOverall(user); // 里程碑时后台刷新整体画像
    return Response.json({ attemptId: ins.lastInsertRowid, correct: !!correct, score, feedback, answer: ans.answer, explanation: ans.explanation, source_type: q.source_type, source_refs: q.source_refs, origin: q.origin || "generated", answer_origin: q.answer_origin || "ai", source_url: q.source_url || null, is_real: !!q.is_real, masteryUpdates, autoTriggers });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
