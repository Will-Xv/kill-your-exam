import db, { upsertDocument } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { searchWeb, generateJson, langInstruction } from "@/lib/gemini";
import { aiErrorResponse } from "@/lib/errors";

export async function POST(req) {
  try {
    const { user } = await requireUser();
    if (!user) return unauthorized();
    const { name, examDate, dailyMinutes } = await req.json();
    // 1) 联网搜索该考试的公开信息
    const search = await searchWeb(
      `请搜索并总结「${name}」这门考试的公开信息:主办方/官方网站、考试大纲结构、题型与分值、报名和考试时间、教材或指定参考资料、近年变化。如果搜不到可靠信息,请如实说明。用中文回答。`
    );
    // 2) 生成认知自评 + 风险提示 + 资料清单 + 考试档案初稿
    const schema = {
      type: "object",
      properties: {
        confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
        known: { type: "array", items: { type: "string" } },
        uncertain: { type: "array", items: { type: "string" } },
        unknown: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
        checklist: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item: { type: "string" },
              why: { type: "string" },
              priority: { type: "string", enum: ["must", "nice"] }
            },
            required: ["item", "why", "priority"]
          }
        },
        dossier_md: { type: "string" }
      },
      required: ["confidence", "known", "uncertain", "unknown", "risks", "checklist", "dossier_md"]
    };
    const report = await generateJson(
      `你是一个诚实的备考助手,即将帮助一位考生备考「${name}」(考试日期:${examDate || "未定"})。
以下是联网搜索到的信息:
${search.text || "(没有搜到有效信息)"}

请生成一份"AI 认知自评报告",必须诚实,宁可低估自己:
- known: 你有把握的信息(有搜索结果或高置信训练知识支撑)
- uncertain: 你不太确定、可能过时或记混的方面
- unknown: 你完全不知道、必须靠用户提供资料的方面
- risks: 使用 AI 备考这门考试的具体风险(例如编造不存在的真题、大纲版本过时等),用考生能听懂的话写
- checklist: 建议考生收集上传的资料清单(6~10项),每项说明"有了它我能多做什么",priority 为 must 或 nice
- dossier_md: 一份 Markdown 格式的"考试档案"初稿,包含考试名称、日期、已知的题型结构、大纲章节、信息来源(注明哪些来自搜索、哪些未经证实)。不知道的部分明确写"待补充"。` + langInstruction(user.lang),
      schema
    );
    const info = db.prepare("INSERT INTO exams(name, exam_date, daily_minutes, self_assessment, checklist, user_id) VALUES(?,?,?,?,?,?)").run(
      name, examDate || null, dailyMinutes || 60,
      JSON.stringify({ ...report, sources: search.sources }),
      JSON.stringify(report.checklist.map((c) => ({ ...c, done: false }))),
      user.id
    );
    const examId = info.lastInsertRowid;
    upsertDocument(examId, "dossier", report.dossier_md);
    return Response.json({ examId, report, sources: search.sources });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
