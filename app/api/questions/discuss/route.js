import db, { inScope } from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { generate, langInstruction, attachParts } from "@/lib/gemini";
import { retrieve, ragBlock, materialParts } from "@/lib/rag";
import { aiErrorResponse } from "@/lib/errors";
import { learnerKpContext } from "@/lib/learnerContext";

export const maxDuration = 120;

// 针对某道题的追问/争论。对话不落库(由前端保存并回传),结束时另行沉淀。
export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    const { questionId, userAnswer, history, attachments, mode } = await req.json();
    const q = db.prepare("SELECT * FROM questions WHERE id=?").get(questionId);
    if (!q || !exam || !inScope(exam.id, q.exam_id)) return forbidden();
    const body = JSON.parse(q.body), ans = JSON.parse(q.answer);
    const kp = q.kp_id ? db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(q.kp_id)?.title : "";
    const hits = await retrieve(exam.id, `${kp} ${body.stem}`, 4);
    const learnerHist = q.kp_id ? learnerKpContext(q.kp_id) : "";

    const LANGN = ["中文","English","français","español","русский","العربية","Bahasa Indonesia"][["zh","en","fr","es","ru","ar","id"].indexOf(user.lang)] || "中文";
    const ctxBlock = `题目背景(考生看不到你这段):\n知识点:${kp}\n题目:${body.stem}\n${body.options?.length ? "选项:" + body.options.join(" | ") : ""}\n参考答案:${ans.answer}\n参考解析:${ans.explanation}\n考生的作答:${userAnswer || "(空)"}\n${learnerHist ? "\n【这位考生在此知识点上的历史(据此因材施教,别重复他已懂的、优先戳他之前的误区)】\n" + learnerHist + "\n" : ""}${hits.length ? "相关资料(优先据此):\\n" + ragBlock(hits) : "(资料库无相关内容,凭知识回答并提醒可能需要核实)"}`;
    const socraticSystem = `你是一位【苏格拉底式导师】,就【这一道题】把考生教到真懂——不替他做、不直接讲答案,而是用【一连串启发式反问】一步步引导他自己想通。\n原则:①先问后教,尽量用问题引导、少直接下结论,实在卡死才给最小提示;②每次只问一个小问题,顺着他的回答走;③答对一步就明确肯定"对,因为…"再往下引,答错就温和点出、用更简单的反问把他拉回正轨,绝不羞辱;④始终以事实/正解为准,绝不为鼓励把错的说成对的;⑤只围绕这道题,考生跑题(问网站功能/别的考试/闲聊)就提醒他到「问问杀手」里问。若考生还没说话,先抛出【第一个最基础的启发式问题】,别一上来讲概念。简洁,用${LANGN}回复。\n\n${ctxBlock}`;
    const discussSystem = `你正在就某一道练习题和考生讨论。你可以解释答案与解析、回答追问,也可以在考生指出你判分/解析确有错误时【修正】你的评价。
但你必须严守以下原则(这是最重要的):
- 以事实与正确性为最高标准。绝不为了迎合考生、让他高兴而放弃正确答案或降低标准。
- 只有当考生的论证在事实/逻辑上确实成立时,才修正你的判分或解析;否则要坚定而友善地坚持,并把道理讲清楚。
- 如果发现题目本身或参考解析确有问题,如实承认。
- 你只负责讨论"这一道题",不处理与本题无关的事。如果考生在这里问网站功能/其它考试/闲聊,礼貌告诉他:这里只讨论当前这道题,想问网站怎么用或做别的,请到"问问杀手"(Ask Killer)功能里问。
- 这场讨论结束后,系统会客观提炼你们的对话,把考生体现出的【理解 / 错误理解】沉淀进他的知识点掌握度(理解→更熟、变绿;错误理解→更弱、变红),而且不止本题:他在讨论里顺带展示出的【别的知识点】的正确理解也会点绿那个知识点、概念性错误会点红(只是没涉及、看不出懂不懂则不动)。所以请把"他哪里真想通了、哪里还有概念错误"聊清楚、判断准确——但这【不改变】你的原则:绝不为了迎合而美化,一切按事实。
- 关于「草稿纸」:草稿纸是考生自己演算用的,内容【不会自动发给你、你看不到】。如果考生说"答案/过程写在草稿纸上了",别假装看到,告诉他:草稿纸我看不到,请点输入框旁的「📝 发草稿纸」按钮把草稿发给我,或用题目下方的「✍️ 手写作答」重新提交;收到图片后再据此评价。
- 简洁、就事论事,用${["中文","English","français","español","русский","العربية","Bahasa Indonesia"][["zh","en","fr","es","ru","ar","id"].indexOf(user.lang)] || "中文"}回复。

题目背景(考生看不到你这段):
知识点:${kp}
题目:${body.stem}
${body.options?.length ? "选项:" + body.options.join(" | ") : ""}
参考答案:${ans.answer}
参考解析:${ans.explanation}
考生的作答:${userAnswer || "(空)"}
${learnerHist ? "【这位考生在此知识点上的历史(据此因材施教)】\n" + learnerHist + "\n" : ""}${hits.length ? "相关资料(优先据此):\\n" + ragBlock(hits) : "(资料库无相关内容,凭知识回答并提醒可能需要核实)"}`;

    const system = mode === "socratic" ? socraticSystem : discussSystem;
    const contents = (history || []).map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] }));
    const ap = await attachParts(attachments);
    const mp = await materialParts(exam.id, { max: 4 });
    if ((ap.length || mp.length) && contents.length) contents[contents.length - 1].parts = [{ text: contents[contents.length - 1].parts[0].text }, ...ap, ...mp];
    const res = await generate(null, { contents, system });
    const reply = res.text || "(未生成回复)";
    return Response.json({ reply });
  } catch (e) { return aiErrorResponse(e); }
}
