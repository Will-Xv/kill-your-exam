import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { generateJson, langInstruction } from "@/lib/gemini";
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

    const schema = { type: "object", properties: {
      insight: { type: "string", description: "从这段讨论中看出的、关于该知识点的:考生的理解到位之处 或 仍存在的薄弱/误区。一两句话,没有值得记录的就留空" },
      kind: { type: "string", enum: ["understanding", "gap", "none"] },
      revise: { type: "boolean", description: "是否需要修订本次判分(仅当讨论中确认原判分错了)" },
      newCorrect: { type: "boolean" },
      newScore: { type: "integer" },
      reviseReason: { type: "string" }
    }, required: ["insight", "kind", "revise"] };

    const out = await generateJson(
      `根据下面这段"考生就某道题与 AI 的讨论",客观提炼结果。题目:${body.stem}\n参考答案:${ans.answer}\n\n讨论记录:\n${convo}\n\n1) insight+kind:是否体现出考生对该知识点的理解到位(understanding)或仍有薄弱/误区(gap)?没有就 kind=none、insight 留空。要客观,不要因为讨论气氛而美化。\n2) revise:仅当讨论中【事实层面确认】原判分判错了(比如考生其实答对但被判错),才 revise=true 并给 newCorrect/newScore/reviseReason;若考生只是不服但没有正当理由,revise=false。严禁为迎合考生而改分。` + langInstruction(user.lang),
      schema);

    let applied = { revised: false };
    if (out.kind !== "none" && out.insight?.trim()) {
      db.prepare("INSERT INTO insights(exam_id,kp_id,question_id,kind,text) VALUES(?,?,?,?,?)").run(exam.id, q.kp_id, questionId, out.kind, out.insight.trim());
      applied.insight = out.insight.trim();
    }
    if (out.revise && attemptId) {
      const at = db.prepare("SELECT * FROM attempts WHERE id=? AND exam_id=?").get(attemptId, exam.id);
      if (at) {
        const nc = out.newCorrect ? 1 : 0;
        const ns = out.newScore != null ? out.newScore : (nc ? 100 : 0);
        db.prepare("UPDATE attempts SET correct=?, score=?, feedback=? WHERE id=?").run(nc, ns, "【讨论后修订】" + (out.reviseReason || ""), attemptId);
        applied.revised = true; applied.newScore = ns; applied.reason = out.reviseReason;
      }
    }
    return Response.json({ ok: true, applied });
  } catch (e) { return aiErrorResponse(e); }
}
