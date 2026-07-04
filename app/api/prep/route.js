import db, { getDocument, upsertDocument } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { searchWeb, generateJson, langInstruction } from "@/lib/gemini";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 300;

const schema = {
  type: "object",
  properties: {
    reminders: { type: "array", items: { type: "object", properties: {
      text: { type: "string" }, category: { type: "string", enum: ["bring", "logistics", "mindset", "rule"] }
    }, required: ["text", "category"] } },
    selfcheck: { type: "array", items: { type: "object", properties: {
      area: { type: "string", enum: ["strategy", "rule"] },
      stem: { type: "string" }, options: { type: "array", items: { type: "string" } },
      answer: { type: "string" }, explanation: { type: "string" }
    }, required: ["area", "stem", "answer", "explanation"] } }
  },
  required: ["reminders", "selfcheck"]
};

async function generatePrep(exam, lang) {
  const dossier = getDocument(exam.id, "dossier")?.content_md || "";
  const search = await searchWeb(`「${exam.name}」考试当天注意事项、需要携带的证件/物品、考场规则、报名与重考等考务规则。用中文总结要点。`);
  const out = await generateJson(
    `为考生准备「${exam.name}」的"考前准备与自测"内容(不是知识练习,是考务与应试层面)。
背景:${dossier.slice(0, 2000)}
联网信息:${search.text?.slice(0, 3000) || "(无)"}

生成两部分:
1) reminders:8~14 条考前提醒。category 分类:bring(要带的证件/物品,如身份证、准考证、2B铅笔)、logistics(时间地点/提前多久到/流程)、mindset(心态与临场)、rule(考场规则,如禁带电子设备)。要具体、可执行。
2) selfcheck:6~10 道"考前自测"题(可选做,帮考生在考前意识到细节),area 分两类:strategy(应试技巧,如时间分配、遇到某类陷阱怎么办)和 rule(考试规则,如重考政策、评分方式)。这些题正是不该出现在平时知识练习里的,放这里最合适。single/多选给4选项写选项字母,判断写"对/错",其余写简短答案;explanation 解释。` + langInstruction(lang),
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
