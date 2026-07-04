import db, { getDocument } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { retrieve, ragBlock } from "@/lib/rag";
import { generateJson, langInstruction } from "@/lib/gemini";
import { aiErrorResponse } from "@/lib/errors";

const schema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          qtype: { type: "string", enum: ["single", "multi", "judge", "fill", "short"] },
          stem: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answer: { type: "string" },
          explanation: { type: "string" },
          difficulty: { type: "integer" }
        },
        required: ["qtype", "stem", "answer", "explanation", "difficulty"]
      }
    }
  },
  required: ["questions"]
};

export async function POST(req) {
  try {
    const { kpId, count = 5, reuse = true } = await req.json();
    const { user, exam } = await requireUser();
  if (!user) return unauthorized();
    if (!exam) return Response.json({ error: "no exam" }, { status: 400 });
    // 优先复用已有未答过的题
    if (reuse) {
      const pool = db.prepare(`SELECT * FROM questions WHERE exam_id=? AND flagged=0 ${kpId ? "AND kp_id=" + Number(kpId) : ""}
        AND id NOT IN (SELECT question_id FROM attempts) ORDER BY RANDOM() LIMIT ?`).all(exam.id, count);
      if (pool.length >= count) return Response.json({ questions: pool.map(pub) });
    }
    let kp = kpId ? db.prepare("SELECT * FROM knowledge_points WHERE id=?").get(kpId) : null;
    if (!kp) {
      // 随机挑一个练得最少的知识点
      kp = db.prepare(`SELECT kp.* FROM knowledge_points kp WHERE kp.exam_id=? AND kp.parent_id IS NOT NULL
        ORDER BY (SELECT COUNT(*) FROM attempts a WHERE a.kp_id=kp.id) ASC, RANDOM() LIMIT 1`).get(exam.id);
    }
    if (!kp) return Response.json({ error: "还没有知识点,请先完成考试设置" }, { status: 400 });
    const chapter = kp.parent_id ? db.prepare("SELECT title FROM knowledge_points WHERE id=?").get(kp.parent_id)?.title : "";
    const hits = await retrieve(exam.id, `${chapter} ${kp.title}`, 5);
    const dossier = getDocument(exam.id, "dossier")?.content_md || "";
    const sourceType = hits.length ? "material" : "model";
    const out = await generateJson(
      `为「${exam.name}」出 ${count} 道练习题,考察知识点「${kp.title}」(章节:${chapter})。
题型混合(single单选/multi多选/judge判断/fill填空/short简答),以客观题为主。
${hits.length ? "必须依据以下资料出题,不得超出资料范围编造细节:\n" + ragBlock(hits) : "⚠️ 没有资料支撑,只能凭训练知识出题,题目要保守、考基本概念,不要编造具体数字或条款。"}
考试档案摘要:${dossier.slice(0, 2000)}
要求:single/multi 提供 4 个选项,answer 写选项字母(多选如 "AC");judge 的 answer 必须写 "对" 或 "错"(这两个字保持中文,不翻译);fill 的 answer 写标准填空内容;short 的 answer 写评分要点。explanation 解释为什么。difficulty 1~3。如果资料语言与输出语言不同,专业术语可保留资料原文,其余不要混合语言。\n\n【出题铁律 · 只出知识性题目】只出考查"对知识点本身的理解"的题。严禁出以下类型(它们不属于平时练习):
- 听力/口语的感知或技巧题(如"如何区分两个词的发音""听到修正词该怎么办"):AI 无法训练这些能力;
- 考试规则/报名/时间/费用/重考政策等事务性信息题;
- 应试技巧/答题策略题(如"遇到X陷阱该怎么做""如何分配时间")。
以上内容只作为背景知识在别处出现,不要当练习题。
【防泄题】同一组题内不得有答案泄露:任何一道题的答案不得出现在另一道题的题干里;各题不要高度相似,也不要反复考同一个点。` + langInstruction(user.lang),
      schema
    );
    const refs = JSON.stringify(hits.map((h) => ({ chunk_id: h.id, filename: h.filename, heading: h.heading_path })));
    const ins = db.prepare("INSERT INTO questions(exam_id,kp_id,qtype,body,answer,difficulty,source_type,source_refs) VALUES(?,?,?,?,?,?,?,?)");
    const saved = [];
    for (const q of out.questions.slice(0, count)) {
      const info = ins.run(exam.id, kp.id, q.qtype, JSON.stringify({ stem: q.stem, options: q.options || [] }),
        JSON.stringify({ answer: q.answer, explanation: q.explanation }), q.difficulty || 2, sourceType, refs);
      saved.push(db.prepare("SELECT * FROM questions WHERE id=?").get(info.lastInsertRowid));
    }
    return Response.json({ questions: saved.map(pub), kp: { id: kp.id, title: kp.title } });
  } catch (e) {
    return aiErrorResponse(e);
  }
}

// 不把答案发给前端
function pub(q) {
  return { id: q.id, kp_id: q.kp_id, qtype: q.qtype, body: JSON.parse(q.body), difficulty: q.difficulty, source_type: q.source_type, source_refs: q.source_refs };
}
