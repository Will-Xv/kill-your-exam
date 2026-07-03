import db, { getDocument, upsertDocument } from "@/lib/db";
import { requireUser, unauthorized, forbidden } from "@/lib/auth";
import { generateJson, embed, cosine } from "@/lib/gemini";
import { aiErrorResponse } from "@/lib/errors";

export async function POST(req) {
  try {
    const { user } = await requireUser();
    if (!user) return unauthorized();
    const { examId } = await req.json();
    const exam = db.prepare("SELECT * FROM exams WHERE id=?").get(examId);
    if (!exam) return Response.json({ error: "exam not found" }, { status: 404 });
    if (exam.user_id !== user.id) return forbidden();
    const dossier = getDocument(examId, "dossier")?.content_md || "";
    const sample = db.prepare("SELECT heading_path, substr(content,1,200) c FROM chunks WHERE exam_id=? LIMIT 40").all(examId);
    const sampleText = sample.map((s) => `${s.heading_path}: ${s.c}`).join("\n").slice(0, 12000);

    // 1) 知识点树
    const treeSchema = {
      type: "object",
      properties: {
        chapters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              points: { type: "array", items: { type: "string" } }
            },
            required: ["title", "points"]
          }
        }
      },
      required: ["chapters"]
    };
    const tree = await generateJson(
      `根据以下考试档案${sampleText ? "和用户上传资料的目录摘要" : ""},生成「${exam.name}」的知识点树(章 → 知识点)。
优先依据档案中的大纲;资料摘要可帮助细化。每章 3~10 个知识点,知识点要具体可学(不要太宽泛)。
考试档案:
${dossier.slice(0, 8000)}
${sampleText ? "资料摘要:\n" + sampleText : ""}`,
      treeSchema
    );

    // 2) 写入知识点 + 计算资料覆盖度
    const chunkRows = db.prepare("SELECT embedding FROM chunks WHERE exam_id=?").all(examId);
    const chunkVecs = chunkRows.map((r) => new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4));
    const insCh = db.prepare("INSERT INTO knowledge_points(exam_id,parent_id,title,sort,coverage) VALUES(?,?,?,?,?)");
    db.prepare("DELETE FROM knowledge_points WHERE exam_id=?").run(examId);
    let sort = 0;
    for (const ch of tree.chapters) {
      const chId = insCh.run(examId, null, ch.title, sort++, "none").lastInsertRowid;
      const titles = ch.points;
      let vecs = [];
      if (chunkVecs.length && titles.length) {
        vecs = await embed(titles.map((t) => `${ch.title} ${t}`));
      }
      titles.forEach((t, i) => {
        let coverage = "none";
        if (vecs[i]) {
          let best = 0;
          for (const cv of chunkVecs) best = Math.max(best, cosine(vecs[i], cv));
          coverage = best > 0.62 ? "covered" : best > 0.5 ? "partial" : "none";
        }
        insCh.run(examId, chId, t, i, coverage);
      });
    }

    // 3) 备考策略 + 进度档案初稿
    const days = exam.exam_date ? Math.max(1, Math.ceil((new Date(exam.exam_date) - Date.now()) / 86400000)) : null;
    const strategySchema = { type: "object", properties: { strategy_md: { type: "string" } }, required: ["strategy_md"] };
    const st = await generateJson(
      `为「${exam.name}」制定备考策略(Markdown)。剩余天数:${days ?? "未知"};每天可用 ${exam.daily_minutes} 分钟。
基于知识点树:${JSON.stringify(tree).slice(0, 4000)}
包含:阶段划分(打基础/强化/冲刺)、每周目标、每日安排建议、复习原则。语气平实,不要空话。`,
      strategySchema
    );
    upsertDocument(examId, "strategy", st.strategy_md);
    upsertDocument(examId, "progress", `# 进度档案\n\n创建于 ${new Date().toLocaleDateString("zh-CN")}。尚未开始练习,暂无数据。`);
    return Response.json({ ok: true });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
