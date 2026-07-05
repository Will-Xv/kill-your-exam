import db, { upsertDocument } from "@/lib/db";
import { searchWeb, generateJson, langInstruction } from "@/lib/gemini";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { aiErrorResponse } from "@/lib/errors";
import { APP_CAPABILITIES } from "@/lib/appGuide";

export const maxDuration = 300;

// 在考试已创建之后运行:联网搜索(用类型+说明+学校做更准的查询)+ 认知自评 + 资料清单
export async function POST(req) {
  try {
    const { user } = await requireUser();
    if (!user) return unauthorized();
    const { examId } = await req.json();
    const exam = db.prepare("SELECT * FROM exams WHERE id=?").get(examId);
    if (!exam) return Response.json({ error: "exam not found" }, { status: 404 });
    if (exam.user_id !== user.id) return forbidden();

    const typeLabel = { school: "学校/院校考试", cert: "职业资格或证书考试", language: "语言考试", grad: "升学考试", other: "考试" }[exam.exam_type] || "考试";
    const ctx = [
      `考试名称:${exam.name}`,
      `类型:${typeLabel}`,
      exam.school ? `学校/机构:${exam.school}` : "",
      exam.notes ? `考生补充说明:${exam.notes}` : "",
      `考试日期:${exam.exam_date || "未定"}`
    ].filter(Boolean).join("\n");

    const search = await searchWeb(
      `请搜索并总结这门考试的公开信息(官方大纲、题型与分值、报名与时间、教材/参考资料、近年变化)。结合以下背景精准检索:\n${ctx}\n用中文回答。若是某学校的内部考试,尽量结合该校/该课程信息。`
    );

    const schema = {
      type: "object",
      properties: {
        confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
        known: { type: "array", items: { type: "string" } },
        uncertain: { type: "array", items: { type: "string" } },
        unknown: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
        checklist: { type: "array", items: { type: "object", properties: {
          item: { type: "string" }, why: { type: "string" },
          priority: { type: "string", enum: ["must", "nice"] },
          kind: { type: "string", enum: ["file", "qa"], description: "file=需要上传的文件资料;qa=可以直接问答获取的信息(如目标分数、当前水平)" }
        }, required: ["item", "why", "priority", "kind"] } },
        dossier_md: { type: "string" }
      },
      required: ["confidence", "known", "uncertain", "unknown", "risks", "checklist", "dossier_md"]
    };
    const report = await generateJson(
      `你是一个诚实的备考助手,正在帮考生备考。背景:\n${ctx}\n\n联网搜索结果:\n${search.text || "(没有搜到有效信息)"}\n\n${APP_CAPABILITIES}\n生成"AI 认知自评报告",必须诚实,宁可低估:known/uncertain/unknown/risks 各列要点(risks 用考生能懂的话讲用 AI 备考这门考试的具体风险,如可能编造不存在的真题、大纲版本过时);checklist 是建议收集/补充的信息 6~10 项,每项标 kind:需要上传文件的标 file,可以直接问答获取的(如目标分数、当前水平、学校课程侧重)标 qa;dossier_md 是 Markdown 考试档案初稿(考试名/类型/日期/已知题型结构/大纲/信息来源,注明哪些来自搜索哪些未证实,不知道的写"待补充")。` + langInstruction(user.lang),
      schema
    );
    db.prepare("UPDATE exams SET self_assessment=?, checklist=?, assess_status='done' WHERE id=?").run(
      JSON.stringify({ ...report, sources: search.sources }),
      JSON.stringify(report.checklist.map((c) => ({ ...c, done: false, answer: "" }))),
      examId
    );
    upsertDocument(examId, "dossier", report.dossier_md);
    return Response.json({ examId, report, sources: search.sources });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
