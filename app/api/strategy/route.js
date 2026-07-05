import db, { getDocument, upsertDocument } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { generateJson, langInstruction } from "@/lib/gemini";
import { APP_CAPABILITIES } from "@/lib/appGuide";
import { masteryMatrix } from "@/lib/mastery";
import { getOverallDoc } from "@/lib/overall";
import { aiErrorResponse } from "@/lib/errors";

// AI 读掌握度数据,给出策略调整建议
export async function GET() {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    if (!exam) return Response.json({ suggestion: null });
    const matrix = masteryMatrix(exam.id);
    if (!matrix.some((m) => m.attempts > 0)) return Response.json({ suggestion: null, reason: "no_data" });
    const summary = matrix.map((m) => `${m.chapter || ""}/${m.title}: ${m.level}(${m.accuracy}% ${m.attempts}题)`).join("\n");
    const strategy = getDocument(exam.id, "strategy")?.content_md || "";
    const overallSnip = (getOverallDoc(user) || "").slice(0, 1000);
    const days = exam.exam_date ? Math.max(0, Math.ceil((new Date(exam.exam_date) - Date.now()) / 86400000)) : null;
    const out = await generateJson(
      `你是「${exam.name}」的备考教练。剩余 ${days ?? "未知"} 天。根据下面的掌握度数据,给出 2~4 条具体、可执行的策略调整建议(指出该重点补哪些薄弱点、哪些已掌握可减少投入)。
掌握度数据:\n${summary}\n\n当前备考策略:\n${strategy.slice(0, 2000)}\n${overallSnip ? "\n考生整体画像(跨所有考试):\n" + overallSnip + "\n" : ""}\n同时给出一份修订后的完整备考策略 Markdown(revised_strategy_md)。\n${APP_CAPABILITIES}` + langInstruction(user.lang),
      { type: "object", properties: {
        suggestions: { type: "array", items: { type: "string" } },
        revised_strategy_md: { type: "string" }
      }, required: ["suggestions", "revised_strategy_md"] }
    );
    return Response.json({ suggestion: out });
  } catch (e) { return aiErrorResponse(e); }
}
// 采纳:写入策略文档
export async function POST(req) {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  const { strategyMd } = await req.json();
  if (exam && strategyMd) upsertDocument(exam.id, "strategy", strategyMd);
  return Response.json({ ok: true });
}
