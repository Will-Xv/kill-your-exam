import db, { inScope } from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { generateJson, langInstruction } from "@/lib/gemini";
import { leafKpList, recordCrossKp } from "@/lib/mastery";
import { aiErrorResponse } from "@/lib/errors";
import { nowStamp } from "@/lib/devtime";

export const maxDuration = 120;

// 自由探索结束:客观提炼考生在这段探索里对【本知识点】的理解/薄弱,沉淀进掌握度;
// 顺带体现出的【别的知识点】理解/误区也一并回流。对话本身丢弃。
export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    const { kpId, history } = await req.json();
    const kp = db.prepare("SELECT * FROM knowledge_points WHERE id=?").get(Number(kpId));
    if (!kp || !exam || !inScope(exam.id, kp.exam_id)) return forbidden();
    if (!history || history.length < 2) return Response.json({ ok: true, applied: null });
    const convo = history.map((m) => `${m.role === "user" ? "考生" : "AI"}:${m.content}`).join("\n").slice(0, 6000);
    const kpList = leafKpList(kp.exam_id);
    const kpListStr = kpList.slice(0, 120).map((k) => `[${k.id}] ${k.chapter ? k.chapter + "/" : ""}${k.title}`).join("\n");

    const schema = { type: "object", properties: {
      insight: { type: "string", description: "从这段自由探索里看出的、关于本知识点的:理解到位之处 或 仍存在的薄弱/误区。一两句话,没有就留空" },
      kind: { type: "string", enum: ["understanding", "gap", "none"] },
      crossKp: { type: "array", description: "探索中考生【顺带】清楚体现出对【别的】知识点(不是本知识点)的深刻理解或明显误区时列出;没有就空数组。kpId 只能取自下面清单。", items: { type: "object", properties: {
        kpId: { type: "integer" }, kind: { type: "string", enum: ["understanding", "misconception"] }, insight: { type: "string" }
      }, required: ["kpId", "kind"] } }
    }, required: ["insight", "kind"] };

    const out = await generateJson(
      `下面是一段"考生围绕某个知识点的自由探索对话(topic-first 学习)",客观提炼结果。本知识点:${kp.title}\n\n探索记录:\n${convo}\n\n1) insight+kind:考生对【本知识点】表现出理解到位(understanding)还是仍有薄弱/误区(gap)?没有值得记录的就 kind=none、insight 留空。要客观,别因气氛美化。\n2) crossKp:考生顺带清楚体现出对【别的知识点】的态度时列出——明确扎实理解=understanding;主动说错/概念错误=misconception;只是没涉及=不要填。宁缺毋滥。本知识点id=${kp.id}(单独处理,别放进 crossKp)。可引用清单:\n${kpListStr}` + langInstruction(user.lang),
      schema);

    const masteryUpdates = [];
    if (out.kind !== "none" && out.insight?.trim()) {
      db.prepare("INSERT INTO insights(exam_id,kp_id,question_id,kind,text,created_at) VALUES(?,?,?,?,?,?)").run(kp.exam_id, kp.id, null, out.kind, out.insight.trim(), nowStamp());
      const th = db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(kp.id)?.title;
      masteryUpdates.push({ kpId: kp.id, title: th, kind: out.kind });
    }
    const cross = recordCrossKp(kp.exam_id, null, out.crossKp, kp.id);
    for (const c of cross) masteryUpdates.push(c);
    return Response.json({ ok: true, applied: { insight: out.insight, masteryUpdates } });
  } catch (e) { return aiErrorResponse(e); }
}
