import db, { inScope } from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { generateJson, langInstruction } from "@/lib/gemini";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 120;

// 用户反馈"题目有问题" + 可选补充说明。AI 分析错因,只在确有问题或用户给了说明时:标记该题 + 记录出题改进经验;否则当误操作,不动。
export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    const { questionId, note } = await req.json();
    const q = db.prepare("SELECT * FROM questions WHERE id=?").get(questionId);
    if (!q || !exam || !inScope(exam.id, q.exam_id)) return forbidden();
    const body = JSON.parse(q.body), ans = JSON.parse(q.answer);
    const isPerform = q.qtype === "perform";
    const desc = isPerform
      ? `题目(表演类·考生用${body.captureType === "video" ? "录像" : "录音"}作答${body.mediaMaterialId ? "、带系统给定音乐" : ""}):${body.stem}
评分维度:${(body.rubric || []).join(" | ") || "(无)"}
考生须知/说明:${body.instructions || "(无)"}`
      : `题目:${body.stem}
${body.options?.length ? "选项:" + body.options.join(" | ") : ""}
参考答案:${ans.answer}
解析:${ans.explanation}`;

    const out = await generateJson(
      `考生反馈下面这道练习题"有问题"。请客观分析题目本身是否确有毛病(${isPerform ? "如:要求不合理/无法用录音录像完成、配乐与要求风格不符或缺失、评分维度与题目不符、超出考生能力或器材范围、与该艺术/表演考试的真实考情不符等" : "如题干歧义、选项有多个正确/无正确、答案错误、与知识点不符、超纲、需要图/音频却用文字问等"})。
${desc}
考生补充说明:${(note || "").trim() || "(未填写)"}

规则:
- 若题目确有毛病(或考生补充说明指出了成立的问题),hasProblem=true,给 reason(简述毛病)和 lesson(一句话经验,用于指导以后【避免再出这种毛病】的题)。
- 若分析不出任何毛病、且考生也没填补充说明,hasProblem=false(视为误操作,不处理)。
- 不要为了照顾考生情绪而无中生有。` + langInstruction(user.lang),
      { type: "object", properties: {
        hasProblem: { type: "boolean" }, reason: { type: "string" }, lesson: { type: "string" }
      }, required: ["hasProblem"] });

    const noteGiven = (note || "").trim().length > 0;
    if (out.hasProblem || noteGiven) {
      db.prepare("UPDATE questions SET flagged=1, flag_reason=? WHERE id=?").run((out.reason || note || "user-reported").slice(0, 300), questionId);
      const lesson = out.lesson || (noteGiven ? note.trim() : "");
      if (lesson) db.prepare("INSERT INTO gen_lessons(exam_id, text) VALUES(?,?)").run(exam.id, lesson.slice(0, 300));
      return Response.json({ acted: true, reason: out.reason || null });
    }
    return Response.json({ acted: false });
  } catch (e) { return aiErrorResponse(e); }
}
