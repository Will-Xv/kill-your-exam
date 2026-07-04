import db from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { generate, langInstruction, attachParts } from "@/lib/gemini";
import { retrieve, ragBlock } from "@/lib/rag";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 120;

// 针对某道题的追问/争论。对话不落库(由前端保存并回传),结束时另行沉淀。
export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    const { questionId, userAnswer, history, attachments } = await req.json();
    const q = db.prepare("SELECT * FROM questions WHERE id=?").get(questionId);
    if (!q || !exam || q.exam_id !== exam.id) return forbidden();
    const body = JSON.parse(q.body), ans = JSON.parse(q.answer);
    const kp = q.kp_id ? db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(q.kp_id)?.title : "";
    const hits = await retrieve(exam.id, `${kp} ${body.stem}`, 4);

    const system = `你正在就某一道练习题和考生讨论。你可以解释答案与解析、回答追问,也可以在考生指出你判分/解析确有错误时【修正】你的评价。
但你必须严守以下原则(这是最重要的):
- 以事实与正确性为最高标准。绝不为了迎合考生、让他高兴而放弃正确答案或降低标准。
- 只有当考生的论证在事实/逻辑上确实成立时,才修正你的判分或解析;否则要坚定而友善地坚持,并把道理讲清楚。
- 如果发现题目本身或参考解析确有问题,如实承认。
- 你只负责讨论"这一道题",不处理与本题无关的事。如果考生在这里问网站功能/其它考试/闲聊,礼貌告诉他:这里只讨论当前这道题,想问网站怎么用或做别的,请到"问问杀手"(Ask Killer)功能里问。
- 简洁、就事论事,用${["中文","English","français","español","русский","العربية","Bahasa Indonesia"][["zh","en","fr","es","ru","ar","id"].indexOf(user.lang)] || "中文"}回复。

题目背景(考生看不到你这段):
知识点:${kp}
题目:${body.stem}
${body.options?.length ? "选项:" + body.options.join(" | ") : ""}
参考答案:${ans.answer}
参考解析:${ans.explanation}
考生的作答:${userAnswer || "(空)"}
${hits.length ? "相关资料(优先据此):\\n" + ragBlock(hits) : "(资料库无相关内容,凭知识回答并提醒可能需要核实)"}`;

    const contents = (history || []).map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] }));
    const ap = attachParts(attachments);
    if (ap.length && contents.length) contents[contents.length - 1].parts = [{ text: contents[contents.length - 1].parts[0].text }, ...ap];
    const res = await generate(null, { contents, system });
    const reply = res.text || "(未生成回复)";
    return Response.json({ reply });
  } catch (e) { return aiErrorResponse(e); }
}
