// 诚实性:判断上传的资料是否属于/相关于这门考试的主题。明显是别的学科/课程的 → 打标提醒,别照它编。
import { generateJson, readImage, langInstruction } from "@/lib/gemini";
import { getDocument } from "@/lib/db";

export async function assessMaterialTopic(exam, { text, buffer, mime, kind }, lang) {
  try {
    const dossier = (getDocument(exam.id, "dossier")?.content_md || "").slice(0, 600);
    let materialDesc = "";
    if (text && text.trim().length >= 30) materialDesc = text.slice(0, 1500);
    else if ((kind === "pdf" || kind === "image") && buffer) {
      try { materialDesc = (await readImage(buffer, mime || "application/pdf", "一句话概括:这份资料是什么学科/主题/哪门课的内容?只输出这一句话。", { maxOutputTokens: 200 })).slice(0, 300); } catch {}
    }
    if (!materialDesc) return { matches: true }; // 拿不到内容就不误报
    const out = await generateJson(
      `一门备考考试:「${exam.name}」${dossier ? "\n它的备考档案摘要:" + dossier : ""}\n\n考生刚给这门考试上传了一份资料,其内容/主题是:\n「${materialDesc}」\n\n判断这份资料是否属于/相关于这门考试的主题。如果它【明显是别的学科/别的课程】的内容(例如数学考试里传了生物资料),matches=false,并在 reason 里用一句话说清这份资料其实是关于什么的、为什么和这门考试不符;若相关、或拿不准,matches=true(宁可不报也别误报)。` + langInstruction(lang),
      { type: "object", properties: { matches: { type: "boolean" }, reason: { type: "string" } }, required: ["matches"] }
    );
    return out && typeof out.matches === "boolean" ? out : { matches: true };
  } catch { return { matches: true }; }
}
