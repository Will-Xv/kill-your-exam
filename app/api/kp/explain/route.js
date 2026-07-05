import db, { getDocument } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { retrieve, ragBlock, materialParts } from "@/lib/rag";
import { generateText, langInstruction } from "@/lib/gemini";
import { aiErrorResponse } from "@/lib/errors";

export async function POST(req) {
  try {
    const { kpId, refresh } = await req.json();
    const kp = db.prepare("SELECT * FROM knowledge_points WHERE id=?").get(kpId);
    if (!kp) return Response.json({ error: "not found" }, { status: 404 });
    if (!refresh) {
      const cached = db.prepare("SELECT * FROM explanations WHERE kp_id=? ORDER BY id DESC LIMIT 1").get(kpId);
      if (cached) return Response.json({ explanation: cached, cached: true });
    }
    const { user, exam } = await requireUser();
  if (!user) return unauthorized();
    const chapter = kp.parent_id ? db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(kp.parent_id)?.title : "";
    const hits = await retrieve(exam.id, `${chapter} ${kp.title}`, 6);
    const dossier = getDocument(exam.id, "dossier")?.content_md || "";
    const sourceType = hits.length ? "material" : "model";
    const mparts = materialParts(exam.id, { kinds: ["image", "audio"], max: 4 });
    const explainPrompt = `你是「${exam.name}」的备考讲师。请讲解知识点「${kp.title}」(所属章节:${chapter})。
${hits.length ? "以下是考生资料库中检索到的相关内容,讲解必须优先以此为准,并在引用处自然融入:\n" + ragBlock(hits) : "⚠️ 资料库中没有找到相关内容,你只能凭训练知识讲解。请在讲解开头用一句话明确提醒考生:这部分内容没有资料支撑,建议对照官方资料核实。"}

考试档案摘要(用于把握重点方向):
${dossier.slice(0, 3000)}

${exam.exam_type === "performance" ? "这是一门艺术/表演/技能类考试,内容不涉及数学。【严禁】使用任何 LaTeX 或数学公式环境($$、$、\\begin{cases}、\\text{}、\\frac 等一律不要),时间、比例、步骤等直接用普通文字写(如 0–15 秒、放大到约 1.2 倍)。" : "仅在确有数学公式时才用 LaTeX 并用 $...$ 或 $$...$$ 包裹(不要裸露反斜杠命令);时间、比例、步骤等普通信息一律用普通文字,不要硬套公式。"}输出 Markdown,结构:## 核心概念 / ## 考点解析 / ## 易错点 / ## 一个例子。语言平实,面向有行业经验的成年考生,不要废话。(标题也要翻译成目标语言)。如果资料语言与输出语言不同,专业术语可保留资料原文并附翻译,其余内容不要混合语言。` + (mparts.length ? "\n(考生资料库中的图片/音频原件已作为附件提供,请直接查看/听取并据此讲解)" : "") + langInstruction(user.lang);
    const md = await generateText(explainPrompt, { temperature: 0.4, ...(mparts.length ? { contents: [{ role: "user", parts: [{ text: explainPrompt }, ...mparts] }] } : {}) });
    const refs = hits.map((h) => ({ chunk_id: h.id, filename: h.filename, heading: h.heading_path }));
    const info = db.prepare("INSERT INTO explanations(kp_id,content_md,source_type,source_refs) VALUES(?,?,?,?)")
      .run(kpId, md, sourceType, JSON.stringify(refs));
    const explanation = db.prepare("SELECT * FROM explanations WHERE id=?").get(info.lastInsertRowid);
    return Response.json({ explanation });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
