// 【内容归属守门】杀手要往当前考试里【新建内容】(布置实践作业 / 批量出题 / 加知识点)前,
// 用这门课的【课纲(知识点树)】当尺子判断这份内容在不在范围内。
// ★判据是"在不在这门课的课纲里",不是"是不是同一个学科"——
//   所以"用 Python 解数学题"放进一门纯证明/计算的数学课,同样算 out(课纲里根本没有编程这块)。
import { generateJson, langInstruction } from "@/lib/gemini";
import { leafKpList } from "@/lib/mastery";

export async function checkInSyllabus(exam, text, lang) {
  const t = String(text || "").trim();
  if (!exam || !t) return { verdict: "in" };
  let kps = [];
  try { kps = leafKpList(exam.id); } catch {}
  if (!kps.length) return { verdict: "in" }; // 还没有知识树 ⇒ 无从判断,不拦(避免建课初期误伤)
  const outline = kps.slice(0, 120).map((k) => `${k.chapter ? k.chapter + " / " : ""}${k.title}`).join("\n");
  try {
    const out = await generateJson(
      `这门考试叫「${exam.name}」。它的课纲(知识点树)如下:\n${outline}\n\n现在准备为这门考试新建/布置这样一份内容:\n「${t.slice(0, 500)}」\n\n` +
      `判断这份内容【是不是落在上面这份课纲的范围内】:\n` +
      `- in:确实是课纲里的、或明显属于这些知识点的内容;\n` +
      `- out:【明显不在】这份课纲范围内。★注意:【哪怕它跟这门课的学科沾边也算 out】——只要课纲里没有这一块。例:课纲全是纯数学的证明与计算,却要求"写程序/用 Python 实现",那就是 out;\n` +
      `- unsure:看不出来、模棱两可。\nreason 用一句话说明理由。` + langInstruction(lang),
      { type: "object", properties: { verdict: { type: "string", enum: ["in", "out", "unsure"] }, reason: { type: "string" } }, required: ["verdict"] }
    );
    return out && ["in", "out", "unsure"].includes(out.verdict) ? out : { verdict: "unsure", reason: "判定结果无法解析" };
  } catch (e) { return { verdict: "error", reason: "判定这次没跑成(AI 没接上)" }; } // 【不再静默放行】判不出来要如实说,交给上层决定
}

// 哪些工具要过这道门,以及从参数里取哪段文字来判断。
// 只管【杀手自己生成的内容】;主人自己上传的作业(add_assignment)不在此列——那本来就是他的真作业。
export const SCOPE_GUARD_ARG = {
  assign_practical_task: (a) => a.topic || (Array.isArray(a.topics) ? a.topics.join("、") : ""),
  generate_question_set: (a) => a.kpTitle || "",
  add_knowledge_point: (a) => [a.chapter, a.title].filter(Boolean).join(" / "),
};
