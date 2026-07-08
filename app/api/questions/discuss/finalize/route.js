import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { generateJson, langInstruction } from "@/lib/gemini";
import { leafKpList, recordCrossKp } from "@/lib/mastery";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 120;

// 讨论结束:从对话里提炼"对知识点的理解/薄弱"沉淀进数据,并在确有必要时修订本次判分。之后对话本身丢弃(不落库)。
export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    const { questionId, attemptId, history } = await req.json();
    const q = db.prepare("SELECT * FROM questions WHERE id=?").get(questionId);
    if (!q || !exam || q.exam_id !== exam.id) return forbidden();
    if (!history || history.length < 2) return Response.json({ ok: true, applied: null });
    const body = JSON.parse(q.body), ans = JSON.parse(q.answer);
    const convo = history.map((m) => `${m.role === "user" ? "考生" : "AI"}:${m.content}`).join("\n").slice(0, 6000);
    const kpList = leafKpList(exam.id);
    const kpListStr = kpList.slice(0, 120).map((k) => `[${k.id}] ${k.chapter ? k.chapter + "/" : ""}${k.title}`).join("\n");

    const schema = { type: "object", properties: {
      insight: { type: "string", description: "从这段讨论中看出的、关于该知识点的:考生的理解到位之处 或 仍存在的薄弱/误区。一两句话,没有值得记录的就留空" },
      kind: { type: "string", enum: ["understanding", "gap", "none"] },
      revise: { type: "boolean", description: "是否需要修订本次判分(仅当讨论中确认原判分错了)" },
      newCorrect: { type: "boolean" },
      newScore: { type: "integer" },
      reviseReason: { type: "string" },
      newFeedback: { type: "string", description: "根据讨论更新后的、对考生这次作答的简短点评(即使不改分,只要讨论让点评更准确就给)" },
      crossKp: { type: "array", description: "讨论中考生【顺带】体现出对【别的】知识点(不是本题知识点)的深刻理解或明显薄弱时,在此列出;没有就空数组。只能引用下面知识点清单里的 kpId。", items: { type: "object", properties: {
        kpId: { type: "integer" }, kind: { type: "string", enum: ["understanding", "misconception"] }, insight: { type: "string", description: "一句话说明在讨论里怎么体现的" }
      }, required: ["kpId", "kind"] } }
    }, required: ["insight", "kind", "revise"] };

    const out = await generateJson(
      `根据下面这段"考生就某道题与 AI 的讨论",客观提炼结果。题目:${body.stem}\n参考答案:${ans.answer}\n\n讨论记录:\n${convo}\n\n1) insight+kind:是否体现出考生对该知识点的理解到位(understanding)或仍有薄弱/误区(gap)?没有就 kind=none、insight 留空。要客观,不要因为讨论气氛而美化。\n2) revise:仅当讨论中【事实层面确认】原判分判错了,才 revise=true 并给 newCorrect/newScore/reviseReason;若考生只是不服但没有正当理由,revise=false。严禁为迎合考生而改分。\n3) newFeedback:如果讨论让"对这次作答的点评"可以更准确(即使不改分),给一句更新后的点评;否则留空。
4) crossKp:如果考生在这段讨论里【顺带】清楚体现出对【别的知识点】(不是本题知识点)的态度,请在 crossKp 里列出,kpId 只能取自下面清单:\n   - 明确表现出正确、扎实的理解 -> kind=understanding\n   - 明确表达出【错误的理解/概念错误】(不是"没提到""不了解",而是主动说错) -> kind=misconception\n   - 只是没涉及、看不出懂不懂 -> 【不要填】(留空,别硬编)\n   要确凿才填、宁缺毋滥,没有就空数组。
本题知识点id=${q.kp_id || 0}(它单独处理,不要放进 crossKp)。可引用的知识点清单:\n${kpListStr}` + langInstruction(user.lang),
      schema);

    let applied = { revised: false };
    const masteryUpdates = [];
    if (out.kind !== "none" && out.insight?.trim()) {
      db.prepare("INSERT INTO insights(exam_id,kp_id,question_id,kind,text) VALUES(?,?,?,?,?)").run(exam.id, q.kp_id, questionId, out.kind, out.insight.trim());
      applied.insight = out.insight.trim();
      if (q.kp_id) { const th = db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(q.kp_id)?.title; masteryUpdates.push({ kpId: q.kp_id, title: th, kind: out.kind }); }
    }
    // 跨知识点:在本题讨论里体现出对别的知识点的理解/薄弱,也据此改动那些知识点的掌握度
    const cross = recordCrossKp(exam.id, questionId, out.crossKp, q.kp_id);
    for (const c of cross) masteryUpdates.push(c);
    applied.masteryUpdates = masteryUpdates;
    if (attemptId) {
      const at = db.prepare("SELECT * FROM attempts WHERE id=? AND exam_id=?").get(attemptId, exam.id);
      if (at) {
        if (out.revise) {
          const nc = out.newCorrect ? 1 : 0;
          const ns = out.newScore != null ? out.newScore : (nc ? 100 : 0);
          const fb = out.newFeedback || ("【讨论后修订】" + (out.reviseReason || ""));
          db.prepare("UPDATE attempts SET correct=?, score=?, feedback=? WHERE id=?").run(nc, ns, fb, attemptId);
          applied.revised = true; applied.newScore = ns; applied.newCorrect = !!nc; applied.reason = out.reviseReason; applied.newFeedback = fb;
        } else if (out.newFeedback && out.newFeedback.trim()) {
          db.prepare("UPDATE attempts SET feedback=? WHERE id=?").run(out.newFeedback.trim(), attemptId);
          applied.newFeedback = out.newFeedback.trim();
        }
      }
    }
    return Response.json({ ok: true, applied });
  } catch (e) { return aiErrorResponse(e); }
}
