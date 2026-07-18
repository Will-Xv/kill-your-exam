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
      `一门备考考试:「${exam.name}」${dossier ? "\n它的备考档案摘要:" + dossier : ""}\n\n考生刚给这门考试上传了一份资料,其内容/主题是:\n「${materialDesc}」\n\n判断这份资料相对这门考试属于哪一种:\n- match:内容在本考试的范围内、且不明显超出;\n- partial:同一学科,但资料覆盖的范围【超出/多于本考试的范围】(例如本考试只考第一单元,资料却是一到三单元的整本教科书),或只与本考试部分重叠——需要用户确认哪部分算本考试范围;\n- mismatch:【明显】是别的学科/别的课程的内容(如数学考试里传了生物资料);\n- unsure:信息不足、看不出、或模棱两可。【宁可 partial / unsure 也别硬判成 match】。\n★关于 syllabus / 课程大纲 / 教学计划 / 评分说明 / 课程主页 / 作业与考试安排表 等【课程框架/行政文档】:这类文档【哪怕没有具体学科知识内容】也可能正是本考试的材料——但【仍要核对它是不是【这门课/这门考试】的】:若它的课程代码/课程名/科目和本考试对得上(如本考试是 MAT137,资料就是 MAT137 的大纲)→判 match,别因"缺少具体学科内容"就误判 unsure;若它【明显是另一门课】的大纲(如本考试 MAT137,却传了 BIO120 的大纲)→判 mismatch;若看不出是哪门课的 → unsure。总之【别只因为"它是个 syllabus"就无脑判 match,要看是不是本课的】。\nreason 用一句话说明(partial 时说清资料多覆盖了什么/超了哪些范围;unsure 时说清为什么拿不准)。` + langInstruction(lang),
      { type: "object", properties: { verdict: { type: "string", enum: ["match", "partial", "mismatch", "unsure"] }, reason: { type: "string" } }, required: ["verdict"] }
    );
    return out && ["match", "partial", "mismatch", "unsure"].includes(out.verdict) ? out : { verdict: "unsure", reason: "系统没能判定这份资料是否属于本考试。" };
  } catch { return { verdict: "unsure", reason: "判定过程出错,请你确认这份资料是否属于本考试。" }; }
}
