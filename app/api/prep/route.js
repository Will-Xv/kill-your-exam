import db, { getDocument, upsertDocument } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { searchWeb, generateJson, langInstruction } from "@/lib/gemini";
import { masteryMatrix } from "@/lib/mastery";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 300;

const schema = {
  type: "object",
  properties: {
    reminders: { type: "array", items: { type: "object", properties: {
      text: { type: "string" }, category: { type: "string", enum: ["bring", "logistics", "mindset", "rule"] }
    }, required: ["text", "category"] } },
    knowledgeCheck: {
      type: "object",
      properties: {
        summary: { type: "string", description: "自测前的总结:复习情况、本次自测重点、考前知识性注意事项" },
        questions: { type: "array", items: { type: "object", properties: {
          topic: { type: "string" }, reason: { type: "string", enum: ["weak", "unreviewed", "key", "likely"] },
          qtype: { type: "string", enum: ["single", "multi", "judge", "fill", "short"] },
          stem: { type: "string" }, options: { type: "array", items: { type: "string" } },
          answer: { type: "string" }, explanation: { type: "string" }
        }, required: ["topic", "reason", "qtype", "stem", "answer", "explanation"] } }
      },
      required: ["summary", "questions"]
    },
    selfcheck: { type: "array", items: { type: "object", properties: {
      area: { type: "string", enum: ["strategy", "rule"] },
      stem: { type: "string" }, options: { type: "array", items: { type: "string" } },
      answer: { type: "string" }, explanation: { type: "string" }
    }, required: ["area", "stem", "answer", "explanation"] } }
  },
  required: ["reminders", "knowledgeCheck", "selfcheck"]
};

async function generatePrep(exam, lang) {
  const dossier = getDocument(exam.id, "dossier")?.content_md || "";
  const matrix = masteryMatrix(exam.id);
  const cnt = (lv) => matrix.filter((m) => m.level === lv).length;
  const masterySummary = `掌握度概况:掌握 ${cnt("mastered")} / 一般 ${cnt("ok")} / 薄弱 ${cnt("weak")} / 未学 ${cnt("unlearned")}(共 ${matrix.length} 个知识点)。
薄弱与未学的知识点:${matrix.filter((m) => m.level === "weak" || m.level === "unlearned").map((m) => `${m.chapter || ""}/${m.title}`).slice(0, 40).join("; ") || "(无)"}
资料未覆盖(AI 凭记忆、需谨慎)的知识点:${matrix.filter((m) => m.coverage === "none").map((m) => m.title).slice(0, 20).join("; ") || "(无)"}`;

  const search = await searchWeb(`「${exam.name}」考试当天注意事项、需携带证件物品、考场规则、报名与重考规则。用中文总结要点。`);
  const out = await generateJson(
    `为考生准备「${exam.name}」的"考前准备与自测"(考务与应试层面 + 一次知识性总检)。
考试档案:${dossier.slice(0, 2500)}
${masterySummary}
联网考务信息:${search.text?.slice(0, 2500) || "(无)"}

生成三部分:
1) reminders:8~14 条考前提醒。category:bring(证件/物品)、logistics(时间地点/流程)、mindset(心态临场)、rule(考场规则)。具体可执行。
2) knowledgeCheck:一次"知识性考前自测"。
   - summary:自测前先总结——当前复习情况(结合掌握度概况)、本次自测的重点、以及考前知识性注意事项(哪些易错点/高频点考前要再看)。
   - questions:6~12 道知识题,从"薄弱/未学/重点/大概率考"里挑,根据情况取舍(不要重复考已掌握的);每题标 reason(weak薄弱/unreviewed未复习/key重点/likely大概率考)和 topic。single/multi给4选项写字母,judge写"对/错",其余写简短答案;explanation 解释。这部分是知识题,和平时练习同源。
3) selfcheck:6~10 道"应试/规则自测"(可选、非知识),area 分 strategy(答题技巧/应试策略,任何科目)和 rule(考试规则)。这些正是不该进平时知识练习的题,放这里。
` + langInstruction(lang),
    schema);
  upsertDocument(exam.id, "prep", JSON.stringify(out));
  return out;
}

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ prep: null });
  const doc = getDocument(exam.id, "prep");
  if (doc?.content_md) { try { return Response.json({ prep: JSON.parse(doc.content_md) }); } catch {} }
  return Response.json({ prep: null });
}
export async function POST() {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    if (!exam) return Response.json({ error: "no exam" }, { status: 400 });
    const prep = await generatePrep(exam, user.lang);
    return Response.json({ prep });
  } catch (e) { return aiErrorResponse(e); }
}
