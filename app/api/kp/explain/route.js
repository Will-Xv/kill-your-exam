import db, { getDocument } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { retrieve, ragBlock } from "@/lib/rag";
import { generateText } from "@/lib/gemini";
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
    const md = await generateText(
      `你是「${exam.name}」的备考讲师。请讲解知识点「${kp.title}」(所属章节:${chapter})。
${hits.length ? "以下是考生资料库中检索到的相关内容,讲解必须优先以此为准,并在引用处自然融入:\n" + ragBlock(hits) : "⚠️ 资料库中没有找到相关内容,你只能凭训练知识讲解。请在讲解开头用一句话明确提醒考生:这部分内容没有资料支撑,建议对照官方资料核实。"}

考试档案摘要(用于把握重点方向):
${dossier.slice(0, 3000)}

输出 Markdown,结构:## 核心概念 / ## 考点解析 / ## 易错点 / ## 一个例子。语言平实,面向有行业经验的成年考生,不要废话。`,
      { temperature: 0.4 }
    );
    const refs = hits.map((h) => ({ chunk_id: h.id, filename: h.filename, heading: h.heading_path }));
    const info = db.prepare("INSERT INTO explanations(kp_id,content_md,source_type,source_refs) VALUES(?,?,?,?)")
      .run(kpId, md, sourceType, JSON.stringify(refs));
    const explanation = db.prepare("SELECT * FROM explanations WHERE id=?").get(info.lastInsertRowid);
    return Response.json({ explanation });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
