// 诚实性:判断上传的资料相对这门考试是 match / mismatch / unsure。
// 明显别科目=mismatch(⚠️);看不出/信息不足/拿不到内容/判定出错=unsure(❓,要标记且杀手要问主人);相关=match。
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
    if (!materialDesc) return { verdict: "unsure", reason: "没能读出这份资料的内容,无法判断是否属于本考试。" }; // 拿不到内容=不确定,要标记
    const out = await generateJson(
      `一门备考考试:「${exam.name}」${dossier ? "\n它的备考档案摘要:" + dossier : ""}\n\n考生刚给这门考试上传了一份资料,其内容/主题是:\n「${materialDesc}」\n\n判断这份资料相对这门考试属于哪一种:\n- match:属于/相关于本考试主题;\n- mismatch:【明显】是别的学科/别的课程的内容(如数学考试里传了生物资料);\n- unsure:信息不足、看不出、或模棱两可。【宁可 unsure 也别硬猜成 match】。\nreason 用一句话说明(unsure 时说清为什么拿不准)。` + langInstruction(lang),
      { type: "object", properties: { verdict: { type: "string", enum: ["match", "mismatch", "unsure"] }, reason: { type: "string" } }, required: ["verdict"] }
    );
    return out && ["match", "mismatch", "unsure"].includes(out.verdict) ? out : { verdict: "unsure", reason: "系统没能判定这份资料是否属于本考试。" };
  } catch { return { verdict: "unsure", reason: "判定过程出错,请你确认这份资料是否属于本考试。" }; }
}
