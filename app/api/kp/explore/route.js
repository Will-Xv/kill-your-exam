import db, { inScope } from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { generate } from "@/lib/gemini";
import { retrieve, ragBlock, materialParts } from "@/lib/rag";
import { learnerKpContext } from "@/lib/learnerContext";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 120;

// Topic-first 自由探索:围绕一个知识点,考生自由发问,AI 实时判断他懂多深,
// 太浅就苏格拉底式反问、够深就抛挑战题——不是普通答疑,是以"考生主动探索"为中心的学习法。
// 对话不落库(前端保存回传),结束时 finalize 沉淀进掌握度。
export async function POST(req) {
  try {
    const { user, exam } = await requireUser();
    if (!user) return unauthorized();
    const { kpId, history, attachments } = await req.json();
    const kp = db.prepare("SELECT * FROM knowledge_points WHERE id=?").get(Number(kpId));
    if (!kp || !exam || !inScope(exam.id, kp.exam_id)) return forbidden();
    const chapter = kp.parent_id ? db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(kp.parent_id)?.title : "";
    const hits = await retrieve(exam.id, `${chapter} ${kp.title}`, 5);
    const LANGN = ["中文", "English", "français", "español", "русский", "العربية", "Bahasa Indonesia"][["zh", "en", "fr", "es", "ru", "ar", "id"].indexOf(user.lang)] || "中文";

    const system = `你是一位【以学生主动探索为中心(topic-first)】的导师,正带考生自由钻研这一个知识点。这【不是】普通答疑,而是一种学习法:让考生围着这个主题【自己发问、自己联想】,你顺着他的好奇心走,同时【实时判断他到底懂多深】,并据此【自适应】地切换教法。
【本节主题】${chapter ? chapter + " / " : ""}${kp.title}
【怎么带】
- 开场(考生还没开口时):用一两句点出这个主题最值得琢磨的地方,然后【把球交给他】——邀请他就这个主题问任何他好奇/困惑的点("关于X,你最想搞清楚什么?或者你觉得它为什么会这样?")。别一上来长篇大论讲概念。
- 每一轮:先【正面、准确】回应他的问题(以事实/资料为准,资料没有就凭知识答并提醒需核实),然后【顺势判断他这一问背后理解的深浅】,并接一步:
  · 如果他【问得浅/有误解/只停在表面】→ 别急着灌,用【一个】苏格拉底式反问把他往深处引,让他自己往前走一步。
  · 如果他【已经问到点子上/答得扎实】→ 抛一道【小挑战】(一个更难的追问、一个反例、或"如果条件变成…会怎样"),逼他把理解用出来、检验真懂。
- 始终只问/只抛一个,别一次堆一堆;顺着他走,别抢着把大纲讲完。
- 以事实为最高标准,绝不为迎合他把错的说成对的;他跑题(问网站功能/别的考试/闲聊)就提醒他到「问问杀手」问。
- 简洁,用${LANGN}回复。
【每次回复最后另起一行,输出一个隐藏标记表示你判断的当前理解深度(考生不必在意):@@DEPTH:shallow 或 @@DEPTH:medium 或 @@DEPTH:deep】

【这位考生在本知识点上的历史(考生看不到你这段;用它来因材施教:别重复他已懂的、优先戳他之前的误区、别问他早答对过的东西)】
${learnerKpContext(kp.id) || "(暂无历史记录)"}

知识背景(考生看不到你这段):${hits.length ? "\n相关资料(优先据此):\n" + ragBlock(hits) : "\n(资料库无相关内容,凭知识回答并提醒可能需要核实)"}`;

    const contents = (history || []).map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] }));
    if (!contents.length) contents.push({ role: "user", parts: [{ text: "(开场:点出这个主题最值得琢磨的地方,然后邀请我就它提问)" }] });  // Gemini 需要至少一条用户消息,否则空 contents 会报错、误弹"API出问题"
    let ap = [];
    try { const { attachParts } = await import("@/lib/gemini"); ap = await attachParts(attachments); } catch {}
    const mp = await materialParts(exam.id, { max: 4 });
    if ((ap.length || mp.length) && contents.length) contents[contents.length - 1].parts = [{ text: contents[contents.length - 1].parts[0].text }, ...ap, ...mp];
    const res = await generate(null, { contents, system });
    let reply = res.text || "(未生成回复)";
    let depth = null;
    const m = reply.match(/@@DEPTH:\s*(shallow|medium|deep)/i);
    if (m) { depth = m[1].toLowerCase(); reply = reply.replace(/@@DEPTH:\s*(shallow|medium|deep)/i, "").trim(); }
    return Response.json({ reply, depth });
  } catch (e) { return aiErrorResponse(e); }
}
