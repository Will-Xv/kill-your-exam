import db, { getDocument, upsertDocument } from "@/lib/db";
import { requireUser, unauthorized } from "@/lib/auth";
import { generate, searchWeb, LANG_NAMES } from "@/lib/gemini";
import { retrieve, ragBlock } from "@/lib/rag";
import { indexMaterial } from "@/lib/rag";
import { buildKnowledgeTree, generateQuestionsForKp } from "@/lib/generators";
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
    description: "获取各知识点的练习次数与正确率统计"
  },
  {
    name: "web_search_and_ingest",
    description: "联网搜索某主题,把综合出的资料存进资料库(作为一份网络来源资料)。用于自动充实资料库。",
    parameters: { type: "object", properties: { query: { type: "string" }, title: { type: "string", description: "存入资料库的标题" } }, required: ["query", "title"] }
  },
  {
    name: "build_knowledge_tree",
    description: "根据考试档案和已入库资料,(重新)生成整个考试的知识点树。会覆盖现有知识点树。"
  },
  {
    name: "generate_question_set",
    description: "为某个知识点或整门考试批量出题,存进题库。不传 kpTitle 则自动挑练得最少的知识点。",
    parameters: { type: "object", properties: { kpTitle: { type: "string" }, count: { type: "integer" } } }
  },
  {
    name: "list_knowledge_points",
    description: "列出当前考试的所有知识点(章 → 点)及资料覆盖情况"
  }
];

async function execTool(name, args, exam, _lang) {
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
      const insights = db.prepare("SELECT text, kind FROM insights WHERE exam_id=? ORDER BY id DESC LIMIT 15").all(exam.id);
      const insText = insights.length ? "\n\n讨论中沉淀的观察:\n" + insights.map((x) => `[${x.kind === "gap" ? "薄弱" : "理解"}] ${x.text}`).join("\n") : "";
      return { stats: (rows.map((r) => `${r.chapter}/${r.title}: 练${r.n}次,对${r.c}次`).join("\n") || "(还没有练习记录)") + insText };
    }
    case "web_search_and_ingest": {
      const r = await searchWeb(`围绕「${args.query}」搜索并综合出一份可用于备考的结构化资料(要点、定义、考点),尽量完整。`);
      const text = r.text || "";
      if (text.trim().length < 80) return { ok: false, note: `联网没搜到「${args.title}」的有效内容` };
      const ins = db.prepare("INSERT INTO materials(exam_id,filename,source_url,kind,status) VALUES(?,?,?,?,?)").run(exam.id, args.title, r.sources?.[0]?.url || null, "web", "processing");
      const n = await indexMaterial(ins.lastInsertRowid, exam.id, text, args.title);
      db.prepare("UPDATE materials SET status='ready' WHERE id=?").run(ins.lastInsertRowid);
      return { ok: true, note: `已联网充实资料:${args.title}(${n} 段)`, chunks: n };
    }
    case "build_knowledge_tree": {
      const r = await buildKnowledgeTree(exam, _lang);
      return { ok: true, note: `已生成知识点树:${r.chapters} 章 ${r.points} 个知识点` };
    }
    case "list_knowledge_points": {
      const rows = db.prepare(`SELECT kp.id, kp.title, kp.coverage, ch.title chapter FROM knowledge_points kp LEFT JOIN knowledge_points ch ON ch.id=kp.parent_id WHERE kp.exam_id=? AND kp.parent_id IS NOT NULL ORDER BY ch.sort, kp.sort`).all(exam.id);
      return { points: rows.map((r) => `[${r.id}] ${r.chapter}/${r.title} (${r.coverage})`).join("\n") || "(还没有知识点,先 build_knowledge_tree)" };
    }
    case "generate_question_set": {
      let kp;
      if (args.kpTitle) kp = db.prepare("SELECT * FROM knowledge_points WHERE exam_id=? AND parent_id IS NOT NULL AND title LIKE ? LIMIT 1").get(exam.id, `%${args.kpTitle}%`);
      if (!kp) kp = db.prepare(`SELECT kp.* FROM knowledge_points kp WHERE kp.exam_id=? AND kp.parent_id IS NOT NULL ORDER BY (SELECT COUNT(*) FROM attempts a WHERE a.kp_id=kp.id) ASC, RANDOM() LIMIT 1`).get(exam.id);
      if (!kp) return { ok: false, note: "还没有知识点,请先 build_knowledge_tree" };
      const n = await generateQuestionsForKp(exam, kp, Math.min(args.count || 5, 10), _lang);
      return { ok: true, note: `已为「${kp.title}」出 ${n} 道题` };
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
你既是问答助手,也是一个能自主执行多步任务的备考 agent。
你的职责:回答备考问题、调整备考策略和考试档案、解读练习数据、帮考生找资料;当考生给出一个较大的目标(如"帮我把这门考试准备好""帮我把第五章补齐"),你要自己拆解成步骤并依次调用工具完成,不要每一步都反问考生。
可用的执行工具:web_search_and_ingest(联网充实资料库)、build_knowledge_tree(生成知识点树)、generate_question_set(批量出题)、list_knowledge_points、get_progress_stats、query_knowledge_base、read_document/update_document。
执行大目标时的推荐顺序:先看已有什么(list_knowledge_points / read_document)→ 缺资料就 web_search_and_ingest → 建/更新知识点树 → 针对薄弱或空缺知识点 generate_question_set → 用 update_document 更新备考策略。每完成一步会自动向考生显示进度,你只需在最后简要汇总做了什么。
原则:
1. 讲解知识必须先用 query_knowledge_base 检索资料;资料没有的内容要明确说明"这是我的训练知识,资料库未覆盖,建议核实"。
2. 考生表达对计划/进度/重点的想法时,主动用 read_document + update_document 更新对应文档。
3. 每次修改文档后,必须用一两句话向考生复述你改了什么。
4. 语气平实友善,像靠谱的助手,不用敬语堆砌,不讲空话。\n5. 回复语言:默认使用考生界面语言(${LANG_NAMES[user.lang] || "中文"});考生用别的语言提问就跟随考生。当考试资料/专业术语的语言与聊天语言不同时,术语可保留原文(必要时附简短翻译);除此之外不要混合语言,除非考生已经表现出会某种语言。`;

    const toolNotes = [];
    let response = await generate(null, { contents, system, tools: [{ functionDeclarations }] });
    for (let i = 0; i < 10; i++) {
      const calls = response.functionCalls;
      if (!calls || !calls.length) break;
      // 保留模型原始 content(含 thoughtSignature,thinking 模型回传必需)
      const modelContent = response.candidates?.[0]?.content || { role: "model", parts: calls.map((fc) => ({ functionCall: fc })) };
      contents.push(modelContent);
      const parts = [];
      for (const fc of calls) {
        const result = await execTool(fc.name, fc.args || {}, exam, user.lang);
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
