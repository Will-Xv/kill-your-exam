import db, { getDocument, upsertDocument } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { generate, searchWeb, LANG_NAMES } from "@/lib/gemini";
import { retrieve, ragBlock } from "@/lib/rag";
import { aiErrorResponse } from "@/lib/errors";

export const maxDuration = 300;

const DOC_TYPES = ["dossier", "strategy", "progress"];
const DOC_NAMES = { dossier: "考试档案", strategy: "备考策略", progress: "进度档案" };

const functionDeclarations = [
  {
    name: "read_document",
    description: "读取三份核心文档之一:dossier(考试档案)/ strategy(备考策略)/ progress(进度档案)",
    parameters: { type: "object", properties: { type: { type: "string", enum: DOC_TYPES } }, required: ["type"] }
  },
  {
    name: "update_document",
    description: "用新的完整 Markdown 内容覆盖某份核心文档。修改前应先 read_document 看当前内容,保留仍然有效的部分。",
    parameters: {
      type: "object",
      properties: { type: { type: "string", enum: DOC_TYPES }, content: { type: "string" } },
      required: ["type", "content"]
    }
  },
  {
    name: "query_knowledge_base",
    description: "在考生上传的资料库中检索相关内容(RAG)",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
  },
  {
    name: "web_search",
    description: "联网搜索公开信息(考试公告、行业资料等),返回摘要和来源链接",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
  },
  {
    name: "get_progress_stats",
    description: "获取各知识点的练习次数与正确率统计",
    parameters: { type: "object", properties: {} }
  }
];

async function execTool(name, args, exam) {
  switch (name) {
    case "read_document": {
      const d = getDocument(exam.id, args.type);
      return { content: d?.content_md || "(空)" };
    }
    case "update_document": {
      upsertDocument(exam.id, args.type, args.content);
      return { ok: true, note: `已更新${DOC_NAMES[args.type]}` };
    }
    case "query_knowledge_base": {
      const hits = await retrieve(exam.id, args.query, 5);
      return { results: hits.length ? ragBlock(hits) : "(资料库中没有找到相关内容)" };
    }
    case "web_search": {
      const r = await searchWeb(args.query + "(请用中文总结)");
      return { summary: r.text, sources: r.sources.slice(0, 5) };
    }
    case "get_progress_stats": {
      const rows = db.prepare(`SELECT kp.title, ch.title chapter, COUNT(a.id) n, COALESCE(SUM(a.correct),0) c
        FROM knowledge_points kp LEFT JOIN knowledge_points ch ON ch.id=kp.parent_id
        LEFT JOIN attempts a ON a.kp_id=kp.id
        WHERE kp.exam_id=? AND kp.parent_id IS NOT NULL GROUP BY kp.id`).all(exam.id);
      return { stats: rows.map((r) => `${r.chapter}/${r.title}: 练${r.n}次,对${r.c}次`).join("\n") || "(还没有练习记录)" };
    }
    default:
      return { error: "unknown tool" };
  }
}

export async function GET() {
  const { user, exam } = await requireUser();
  if (!user) return unauthorized();
  if (!exam) return Response.json({ messages: [] });
  const messages = db.prepare("SELECT * FROM chat_messages WHERE exam_id=? ORDER BY id DESC LIMIT 60").all(exam.id).reverse();
  return Response.json({ messages });
}

export async function POST(req) {
  try {
    const { message } = await req.json();
    const { user, exam } = await requireUser();
  if (!user) return unauthorized();
    if (!exam) return Response.json({ error: "请先创建考试" }, { status: 400 });
    db.prepare("INSERT INTO chat_messages(exam_id,role,content) VALUES(?,?,?)").run(exam.id, "user", message);

    const history = db.prepare("SELECT role, content FROM chat_messages WHERE exam_id=? AND role IN ('user','model') ORDER BY id DESC LIMIT 24").all(exam.id).reverse();
    const contents = history.map((m) => ({ role: m.role, parts: [{ text: m.content }] }));

    const system = `你是「${exam.name}」的备考管家,考生是一位有丰富行业经验的成年人。考试日期:${exam.exam_date || "未定"}。
你的职责:回答备考问题、根据考生的想法调整备考策略和考试档案、解读练习数据、帮考生找资料。
原则:
1. 讲解知识必须先用 query_knowledge_base 检索资料;资料没有的内容要明确说明"这是我的训练知识,资料库未覆盖,建议核实"。
2. 考生表达对计划/进度/重点的想法时,主动用 read_document + update_document 更新对应文档。
3. 每次修改文档后,必须用一两句话向考生复述你改了什么。
4. 语气平实友善,像靠谱的助手,不用敬语堆砌,不讲空话。\n5. 回复语言:默认使用考生界面语言(${LANG_NAMES[user.lang] || "中文"});但如果考生用别的语言提问,就跟随考生的语言。`;

    const toolNotes = [];
    let response = await generate(null, { contents, system, tools: [{ functionDeclarations }] });
    for (let i = 0; i < 6; i++) {
      const calls = response.functionCalls;
      if (!calls || !calls.length) break;
      contents.push({ role: "model", parts: calls.map((fc) => ({ functionCall: fc })) });
      const parts = [];
      for (const fc of calls) {
        const result = await execTool(fc.name, fc.args || {}, exam);
        if (result?.note) toolNotes.push(result.note);
        parts.push({ functionResponse: { name: fc.name, response: { result } } });
      }
      contents.push({ role: "user", parts });
      response = await generate(null, { contents, system, tools: [{ functionDeclarations }] });
    }
    const reply = response.text || "(没有生成回复,请重试)";
    db.prepare("INSERT INTO chat_messages(exam_id,role,content) VALUES(?,?,?)").run(exam.id, "model", reply);
    return Response.json({ reply, toolNotes });
  } catch (e) {
    return aiErrorResponse(e);
  }
}
